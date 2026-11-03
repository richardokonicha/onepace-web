"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  readProgressMap,
  subscribeToProgress,
  type WatchProgress,
} from "@/lib/watch-progress";

const WatchProgressContext = createContext<Record<number, WatchProgress>>({});

/**
 * Returns whether two progress maps hold the same entries.
 *
 * The player notifies on every save (every few seconds), so without this the
 * provider would replace its state on every tick and every library card would
 * re-render. The maps are small, so a shallow per-key comparison is cheap.
 */
function sameProgress(
  a: Record<number, WatchProgress>,
  b: Record<number, WatchProgress>
) {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i]
    if (!(key in b)) return false
    const prev = a[key as unknown as number]
    const next = b[key as unknown as number]
    if (
      prev.episodeId !== next.episodeId ||
      prev.currentTime !== next.currentTime ||
      prev.duration !== next.duration ||
      prev.updatedAt !== next.updatedAt
    ) {
      return false
    }
  }
  return true
}

/**
 * Shares the stored watch progress with the library.
 *
 * The progress lives in local storage, which the player writes while an
 * episode plays. The provider reads it once and keeps it in sync, so every
 * card sees the same state instead of reading the storage on its own.
 */
export function WatchProgressProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [progress, setProgress] = useState<Record<number, WatchProgress>>({});

  useEffect(() => {
    let current: Record<number, WatchProgress> = {}
    const update = () => {
      const next = readProgressMap()
      if (sameProgress(current, next)) return
      current = next
      setProgress(next)
    }
    update()
    return subscribeToProgress(update)
  }, [])

  const value = useMemo(() => progress, [progress])

  return (
    <WatchProgressContext.Provider value={value}>
      {children}
    </WatchProgressContext.Provider>
  )
}

/**
 * The watch progress of every episode that has been started.
 */
export function useWatchProgressMap() {
  return useContext(WatchProgressContext);
}
