"use client"

import { useEffect, useRef } from "react"

import { useMediaEvents } from "@/components/limeplay/media-provider"
import type { AssetEvents } from "@/hooks/limeplay/use-asset"
import { usePlaylistStore } from "@/hooks/limeplay/use-playlist"
import { useMediaStore } from "@/hooks/limeplay/use-media"
import { useTimelineStore } from "@/hooks/limeplay/use-timeline"
import {
  COMPLETED_MARGIN_SECONDS,
  MIN_PROGRESS_SECONDS,
  readProgressMap,
  removeProgress,
  writeProgress,
} from "@/lib/watch-progress"

/** How often the restore is retried while the metadata is still missing. */
const RESTORE_RETRY_MS = 100

/** How long the restore is retried before it is given up on. */
const MAX_RESTORE_ATTEMPTS = 50

/** How often the position of the episode is written to the storage. */
const SAVE_INTERVAL_MS = 5000

/**
 * How many seeks a single restore may issue.
 *
 * Every seek aborts the segment request that is in flight, so a restore that
 * keeps missing its target would stall the playback instead of resuming it.
 */
const MAX_RESTORE_SEEKS = 3

/** How close the playhead has to be to the saved position to count as restored. */
const RESTORE_TOLERANCE_SECONDS = 1

function loadProgress(epId: number): number | null {
  const progress = readProgressMap()[epId] ?? null
  if (!progress) return null
  if (progress.duration <= 0) return null
  if (progress.currentTime < MIN_PROGRESS_SECONDS) return null
  if (progress.currentTime >= progress.duration - COMPLETED_MARGIN_SECONDS) {
    removeProgress(epId)
    return null
  }
  return progress.currentTime
}

/**
 * Writes the position of an episode to the storage.
 *
 * A position below the threshold is not worth storing, so it is left alone
 * here. The stale entry of an episode that was played from the start again
 * is removed by the caller instead.
 */
function writeProgressNow(epId: number, currentTime: number, duration: number) {
  if (currentTime < MIN_PROGRESS_SECONDS) return
  if (duration <= 0) return
  if (currentTime >= duration - COMPLETED_MARGIN_SECONDS) {
    removeProgress(epId)
    return
  }
  writeProgress({
    episodeId: epId,
    currentTime,
    duration,
    updatedAt: Date.now(),
  })
}

export function useWatchProgress() {
  const episodeId = usePlaylistStore((state) => state.currentItem?.properties?.episodeId)
  const mediaElement = useMediaStore((media) => media.mediaElement)
  const seek = useTimelineStore((timeline) => timeline.seek)
  const events = useMediaEvents<AssetEvents>()

  const lastSavedTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!episodeId || !mediaElement) return

    const epId = episodeId as number
    // Every episode saves on its own schedule, so the throttle starts over
    // when the effect runs for a new episode.
    lastSavedTimeRef.current = 0
    let restored = false
    // Whether the restore reached its target. The stale position of an
    // episode that was played from the start again is only removed once the
    // restore settled, because until then the playhead is still at 0 and the
    // stored position is the one that is about to be restored.
    let restoreCompleted = false
    // The last position that was seen during playback. It is used instead of
    // the live playhead, so a load that rewinds the playhead cannot be
    // mistaken for a deliberate restart.
    let lastKnownTime = 0
    let attempts = 0
    let seeks = 0
    // The player rewinds the playhead when it attaches the media source, so
    // the restore has to wait until the asset is loaded. Seeking earlier
    // would be undone by the load and the episode would start over.
    let assetLoaded = false

    const tryRestore = () => {
      if (restored) return
      if (!assetLoaded) return
      if (mediaElement.readyState < 1) return

      const seekTime = loadProgress(epId)
      if (seekTime == null) {
        restored = true
        restoreCompleted = true
        return
      }

      // The playhead is compared against the target to tell a working seek
      // from a rejected one. The timeline only learns the duration once the
      // metadata is parsed, so an early attempt can be a no-op.
      if (
        Math.abs(mediaElement.currentTime - seekTime) <
        RESTORE_TOLERANCE_SECONDS
      ) {
        restored = true
        restoreCompleted = true
        return
      }

      // A seek that is still on its way is not repeated, otherwise every
      // attempt would cancel the pending one and the playhead would never
      // move.
      if (mediaElement.seeking) return

      // A restore that keeps missing its target gives up instead of seeking
      // again and again, because every seek cancels the segment request that
      // is in flight.
      if (seeks >= MAX_RESTORE_SEEKS) {
        restored = true
        return
      }

      seeks += 1
      seek(seekTime)
    }

    const onMetadata = () => tryRestore()

    mediaElement.addEventListener("loadedmetadata", onMetadata)
    mediaElement.addEventListener("durationchange", onMetadata)
    mediaElement.addEventListener("canplay", onMetadata)

    /**
     * Arms (or re-arms) the retry window.
     *
     * The window has to survive a same-episode re-load: the effect that owns
     * it does not re-run when only the asset changes, so the interval created
     * at the first mount is the only one that exists. A new load rewinds the
     * playhead again, so the window is restarted on every load rather than
     * being left to die after the first five seconds.
     */
    let restoreTimer: number | null = null
    const startRestoreWindow = () => {
      if (restoreTimer) {
        window.clearInterval(restoreTimer)
      }
      attempts = 0
      restoreTimer = window.setInterval(() => {
        attempts += 1
        tryRestore()
        if (restored || attempts >= MAX_RESTORE_ATTEMPTS) {
          if (restoreTimer) {
            window.clearInterval(restoreTimer)
            restoreTimer = null
          }
        }
      }, RESTORE_RETRY_MS)
    }

    // A new load rewinds the playhead again, so the restore starts over with
    // the new asset. The retry window is restarted as well, because the
    // effect does not re-run on a same-episode re-load and the previous
    // interval would otherwise be dead by the time the metadata arrives.
    const offAssetLoadStart = events.on("assetloadstart", () => {
      assetLoaded = false
      restored = false
      restoreCompleted = false
      seeks = 0
      startRestoreWindow()
    })

    const offAssetLoaded = events.on("assetloaded", () => {
      assetLoaded = true
      tryRestore()
    })

    startRestoreWindow()
    tryRestore()

    /**
     * Removes the stored position of an episode that was played from the
     * start again.
     *
     * The clear only runs once the restore settled. Until then the playhead
     * is still at 0 because the restore has not landed yet, and removing the
     * entry then would wipe the position that is about to be restored.
     */
    const clearRestartedProgress = () => {
      if (!restoreCompleted) return
      if (lastKnownTime >= MIN_PROGRESS_SECONDS) return
      removeProgress(epId)
    }

    const onTimeUpdate = () => {
      lastKnownTime = mediaElement.currentTime
      const now = Date.now()
      if (now - lastSavedTimeRef.current < SAVE_INTERVAL_MS) return
      lastSavedTimeRef.current = now
      clearRestartedProgress()
      writeProgressNow(epId, lastKnownTime, mediaElement.duration)
    }

    mediaElement.addEventListener("timeupdate", onTimeUpdate)
    return () => {
      if (restoreTimer) {
        window.clearInterval(restoreTimer)
        restoreTimer = null
      }
      offAssetLoadStart()
      offAssetLoaded()
      mediaElement.removeEventListener("loadedmetadata", onMetadata)
      mediaElement.removeEventListener("durationchange", onMetadata)
      mediaElement.removeEventListener("canplay", onMetadata)
      mediaElement.removeEventListener("timeupdate", onTimeUpdate)
      clearRestartedProgress()
      writeProgressNow(epId, mediaElement.currentTime, mediaElement.duration)
    }
  }, [episodeId, mediaElement, seek, events])
}