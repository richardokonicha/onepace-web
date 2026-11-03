export interface WatchProgress {
  episodeId: number;
  currentTime: number;
  duration: number;
  updatedAt: number;
}

export const WATCH_PROGRESS_STORAGE_KEY = "onepace-watch-progress";

/** A position below this is not worth resuming, it is just the first seconds. */
export const MIN_PROGRESS_SECONDS = 10;

/** Within the last minute an episode counts as finished. */
export const COMPLETED_MARGIN_SECONDS = 60;

const CHANGE_EVENT = "onepace:watch-progress";

/**
 * Reads every stored episode progress.
 *
 * The storage is shared by the player, which writes it while an episode
 * plays, and the library, which reads it to show where the viewer left off.
 */
export function readProgressMap(): Record<number, WatchProgress> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(WATCH_PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WatchProgress>;
    const result: Record<number, WatchProgress> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (
        Number.isFinite(id) &&
        value &&
        typeof value.currentTime === "number" &&
        Number.isFinite(value.currentTime) &&
        typeof value.duration === "number" &&
        Number.isFinite(value.duration) &&
        value.duration > 0
      ) {
        result[id] = { ...value, episodeId: id };
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Whether an episode was left in the middle.
 */
export function isResumable(progress: WatchProgress | null | undefined): boolean {
  if (!progress) return false;
  if (progress.duration <= 0) return false;
  if (progress.currentTime < MIN_PROGRESS_SECONDS) return false;
  return progress.currentTime < progress.duration - COMPLETED_MARGIN_SECONDS;
}

/**
 * How much of an episode was watched, as a rounded percentage.
 *
 * The value is a plain number so it can be used as a stable snapshot for
 * `useSyncExternalStore`.
 */
export function getProgressPercent(
  progress: WatchProgress | null | undefined
): number {
  if (!isResumable(progress) || !progress) return 0;
  return Math.round((progress.currentTime / progress.duration) * 100);
}

/**
 * Stores the position of an episode.
 *
 * The change is announced so the library picks it up without a reload.
 */
export function writeProgress(progress: WatchProgress) {
  if (typeof window === "undefined") return;

  if (!(progress.duration > 0) || !Number.isFinite(progress.currentTime)) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(WATCH_PROGRESS_STORAGE_KEY);
    const all = raw
      ? (JSON.parse(raw) as Record<string, WatchProgress>)
      : ({} as Record<string, WatchProgress>);
    all[String(progress.episodeId)] = progress;
    window.localStorage.setItem(
      WATCH_PROGRESS_STORAGE_KEY,
      JSON.stringify(all)
    );
    notifyProgressChanged();
  } catch {
  }
}

/**
 * Removes the stored position of an episode.
 */
export function removeProgress(episodeId: number) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(WATCH_PROGRESS_STORAGE_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as Record<string, WatchProgress>;
    delete all[String(episodeId)];
    window.localStorage.setItem(
      WATCH_PROGRESS_STORAGE_KEY,
      JSON.stringify(all)
    );
    notifyProgressChanged();
  } catch {
  }
}

/**
 * Notifies listeners that the stored progress changed.
 */
export function notifyProgressChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Subscribes to progress changes.
 *
 * The storage event covers other tabs, the custom event covers this one.
 */
export function subscribeToProgress(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}
