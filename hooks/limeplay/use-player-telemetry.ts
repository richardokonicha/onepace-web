"use client"

import * as React from "react"

import { usePlaybackStore } from "@/hooks/limeplay/use-playback"
import { usePlayerStore } from "@/hooks/limeplay/use-player"
import { useTimelineStore } from "@/hooks/limeplay/use-timeline"

/**
 * Live playback telemetry pulled from Shaka and the Limeplay timeline store.
 */
export interface PlayerTelemetry {
  /** Shaka's current bandwidth estimate, in bits per second. */
  bandwidth: number
  /** Measured segment throughput, in bytes per second. */
  throughput: number
  /** Seconds of media buffered ahead of the playhead. */
  bufferedAhead: number
  /** Frames decoded since the player started. */
  decodedFrames: number
  /** Frames dropped since the player started. */
  droppedFrames: number
}

const EMPTY_TELEMETRY: PlayerTelemetry = {
  bandwidth: 0,
  bufferedAhead: 0,
  decodedFrames: 0,
  droppedFrames: 0,
  throughput: 0,
}

/**
 * Samples Shaka's playback statistics on an interval and derives network
 * throughput from the byte counters.
 *
 * The hook reuses the Limeplay player and timeline stores, so it follows the
 * active asset automatically and keeps working when playback is routed to an
 * external receiver.
 */
export function usePlayerTelemetry(intervalMs = 1000): PlayerTelemetry {
  const player = usePlayerStore((state) => state.instance)
  const status = usePlaybackStore((state) => state.status)
  const buffered = useTimelineStore((state) => state.buffered)
  const currentTime = useTimelineStore((state) => state.currentTime)

  const [telemetry, setTelemetry] = React.useState<PlayerTelemetry>(
    EMPTY_TELEMETRY
  )

  const previousBytesRef = React.useRef<null | number>(null)
  const previousTimeRef = React.useRef<null | number>(null)

  React.useEffect(() => {
    if (!player) {
      setTelemetry(EMPTY_TELEMETRY)
      return
    }

    if (status !== "playing" && status !== "buffering") return

    const sample = () => {
      try {
        const stats = player.getStats()
        const bytes = Number(stats.bytesDownloaded)
        const now = performance.now()

        let throughput = 0
        const previousBytes = previousBytesRef.current
        const previousTime = previousTimeRef.current

        if (
          previousBytes !== null &&
          previousTime !== null &&
          Number.isFinite(bytes) &&
          now > previousTime
        ) {
          const deltaBytes = bytes - previousBytes
          const deltaSeconds = (now - previousTime) / 1000

          if (deltaBytes >= 0 && deltaSeconds > 0) {
            throughput = deltaBytes / deltaSeconds
          }
        }

        previousBytesRef.current = Number.isFinite(bytes) ? bytes : null
        previousTimeRef.current = now

        setTelemetry({
          bandwidth: Number(stats.estimatedBandwidth) || 0,
          bufferedAhead: 0,
          decodedFrames: Number(stats.decodedFrames) || 0,
          droppedFrames: Number(stats.droppedFrames) || 0,
          throughput,
        })
      } catch {
        /* stats are unavailable until a manifest is loaded */
      }
    }

    sample()
    const timer = window.setInterval(sample, intervalMs)

    return () => {
      window.clearInterval(timer)
    }
  }, [intervalMs, player, status])

  // Buffered seconds ahead of the playhead come from the Limeplay timeline
  // store, which already tracks the live buffered ranges.
  const bufferedAhead = React.useMemo(() => {
    if (!buffered.length) return 0

    return buffered.reduce((total, range) => {
      if (range.end <= currentTime) return total
      return total + (range.end - Math.max(range.start, currentTime))
    }, 0)
  }, [buffered, currentTime])

  return React.useMemo(
    () => ({ ...telemetry, bufferedAhead }),
    [bufferedAhead, telemetry]
  )
}
