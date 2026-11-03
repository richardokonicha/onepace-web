"use client"

import * as React from "react"

import type {
  MediaEventSlice,
  MediaFeature,
  MediaStore,
} from "@/components/limeplay/media-provider"

import {
  useMediaEvents,
  useMediaFeatureApi,
  useMediaFeatureStore,
} from "@/components/limeplay/media-provider"
import { useInterval } from "@/hooks/limeplay/use-interval"
import { useMediaStore } from "@/hooks/limeplay/use-media"
import { usePlaybackStore } from "@/hooks/limeplay/use-playback"
import {
  type PlayerStore,
  usePlayerStore,
} from "@/hooks/limeplay/use-player"
import { off, on } from "@/lib/utils"

export const BUFFERING_FEATURE_KEY = "buffering"

/** How often the buffered media ahead of the playhead is measured. */
const BUFFERED_AHEAD_INTERVAL_MS = 1000

export interface BufferingEvents {
  bufferingchange: { isBuffering: boolean }
}

export interface BufferingStore extends MediaEventSlice<BufferingEvents> {
  [BUFFERING_FEATURE_KEY]: {
    /**
     * True while the player has no media to play and waits for more.
     */
    isBuffering: boolean
    /**
     * Seconds of media that are buffered ahead of the playhead.
     */
    bufferedAhead: number
    setBuffering: (isBuffering: boolean) => void
    setBufferedAhead: (bufferedAhead: number) => void
  }
}

/**
 * Measures the media that is buffered ahead of the playhead.
 *
 * The media element owns the buffered ranges, so the measurement stays
 * correct while the player is stalling and no longer refreshes them.
 */
function measureBufferedAhead(media: HTMLMediaElement): number {
  const ranges = media.buffered
  const currentTime = media.currentTime

  let bufferedAhead = 0

  for (let index = 0; index < ranges.length; index += 1) {
    const start = ranges.start(index)
    const end = ranges.end(index)

    if (end <= currentTime) continue

    bufferedAhead += end - Math.max(start, currentTime)
  }

  return bufferedAhead
}

export function bufferingFeature(): MediaFeature<
  BufferingStore,
  MediaStore & BufferingStore & PlayerStore
> {
  return {
    createSlice: (set) => ({
      [BUFFERING_FEATURE_KEY]: {
        bufferedAhead: 0,
        isBuffering: false,
        setBuffering: (isBuffering) => {
          set(({ buffering }) => {
            buffering.isBuffering = isBuffering
          })
        },
        setBufferedAhead: (bufferedAhead) => {
          set(({ buffering }) => {
            buffering.bufferedAhead = bufferedAhead
          })
        },
      },
    }),
    key: BUFFERING_FEATURE_KEY,
    Setup: BufferingSetup,
  }
}

export function useBufferingStore<TSelected>(
  selector: (state: BufferingStore["buffering"]) => TSelected
): TSelected {
  return useMediaFeatureStore<BufferingStore, TSelected>(
    BUFFERING_FEATURE_KEY,
    (state) => selector(state.buffering)
  )
}

function BufferingSetup() {
  const store = useMediaFeatureApi<BufferingStore>(BUFFERING_FEATURE_KEY)
  const events = useMediaEvents<BufferingEvents>()
  const player = usePlayerStore((state) => state.instance)
  const mediaElement = useMediaStore((state) => state.mediaElement)
  const status = usePlaybackStore((state) => state.status)

  // The measurements only matter while a stream is played or filled, a
  // paused stream keeps the buffer it has and reports new ranges with the
  // progress event.
  const isActive =
    status === "playing" ||
    status === "buffering" ||
    status === "canplay" ||
    status === "canplaythrough"

  const syncBufferedAhead = React.useCallback(() => {
    if (!mediaElement) return

    const bufferedAhead = measureBufferedAhead(mediaElement)

    store.getState().buffering.setBufferedAhead(bufferedAhead)
  }, [mediaElement, store])

  React.useEffect(() => {
    if (!player) return

    const handleBuffering = () => {
      const isBuffering = player.isBuffering()

      store.getState().buffering.setBuffering(isBuffering)
      events.emit("bufferingchange", { isBuffering })
    }

    on(player, "buffering", handleBuffering)
    handleBuffering()

    return () => {
      off(player, "buffering", handleBuffering)
    }
  }, [events, player, store])

  React.useEffect(() => {
    if (!mediaElement) return

    const media = mediaElement

    // The browser reports new buffered ranges with the progress event, so
    // the measurement does not have to wait for the next tick.
    on(media, "progress", syncBufferedAhead)
    syncBufferedAhead()

    return () => {
      off(media, "progress", syncBufferedAhead)
    }
  }, [mediaElement, syncBufferedAhead])

  useInterval(
    syncBufferedAhead,
    isActive && mediaElement ? BUFFERED_AHEAD_INTERVAL_MS : null
  )

  return null
}
