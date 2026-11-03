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
  type WatchProgress,
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

function saveProgressNow(epId: number, currentTime: number, duration: number) {
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
    let restored = false
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

    const restoreTimer = window.setInterval(() => {
      attempts += 1
      tryRestore()
      if (restored || attempts >= MAX_RESTORE_ATTEMPTS) {
        window.clearInterval(restoreTimer)
      }
    }, RESTORE_RETRY_MS)

    // A new load rewinds the playhead again, so the restore starts over with
    // the new asset.
    const offAssetLoadStart = events.on("assetloadstart", () => {
      assetLoaded = false
      restored = false
      seeks = 0
    })

    const offAssetLoaded = events.on("assetloaded", () => {
      assetLoaded = true
      tryRestore()
    })

    tryRestore()

    const onTimeUpdate = () => {
      const now = Date.now()
      if (now - lastSavedTimeRef.current >= SAVE_INTERVAL_MS) {
        saveProgressNow(epId, mediaElement.currentTime, mediaElement.duration)
      }
    }

    mediaElement.addEventListener("timeupdate", onTimeUpdate)
    return () => {
      window.clearInterval(restoreTimer)
      offAssetLoadStart()
      offAssetLoaded()
      mediaElement.removeEventListener("loadedmetadata", onMetadata)
      mediaElement.removeEventListener("durationchange", onMetadata)
      mediaElement.removeEventListener("canplay", onMetadata)
      mediaElement.removeEventListener("timeupdate", onTimeUpdate)
      saveProgressNow(epId, mediaElement.currentTime, mediaElement.duration)
    }
  }, [episodeId, mediaElement, seek, events])

  return { loadProgress, saveProgressNow, clearProgress: removeProgress }
}

export function getWatchProgress(episodeId: number): WatchProgress | null {
  return readProgressMap()[episodeId] ?? null
}

export function clearWatchProgress(episodeId: number) {
  removeProgress(episodeId)
}