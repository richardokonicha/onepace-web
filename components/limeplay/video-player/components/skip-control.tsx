"use client"

import { FastForwardIcon, RewindIcon } from "@phosphor-icons/react"

import { Button } from "@/components/limeplay/video-player/components/button"
import { useTimelineStore } from "@/hooks/limeplay/use-timeline"

/** Amount of seconds a skip control jumps. */
export const SKIP_SECONDS = 10

export interface SkipControlProps {
  /** Direction of the jump. */
  direction: "backward" | "forward"
}

/**
 * Jumps the playhead forwards or backwards.
 *
 * The jump is clamped to the seekable range by the timeline store, so the
 * control stays safe at the very start or the very end of the media.
 */
export function SkipControl({ direction }: SkipControlProps) {
  const duration = useTimelineStore((state) => state.duration)
  const skip = useTimelineStore((state) => state.skip)
  const isForward = direction === "forward"
  const disabled = !Number.isFinite(duration) || duration <= 0

  return (
    <Button
      aria-label={
        isForward
          ? `Skip forward ${SKIP_SECONDS} seconds`
          : `Skip back ${SKIP_SECONDS} seconds`
      }
      className="cursor-pointer"
      disabled={disabled}
      onClick={() => skip(isForward ? SKIP_SECONDS : -SKIP_SECONDS)}
      size="icon"
      variant="glass"
    >
      <span className="relative flex size-4 items-center justify-center">
        {isForward ? (
          <FastForwardIcon className="size-4" weight="fill" />
        ) : (
          <RewindIcon className="size-4" weight="fill" />
        )}
        <span
          className="
            absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-1
            text-[7px]/3 font-bold text-white tabular-nums
          "
        >
          {SKIP_SECONDS}
        </span>
      </span>
    </Button>
  )
}
