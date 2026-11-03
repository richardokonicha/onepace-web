"use client"

import { Airplay } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/limeplay/video-player/components/button"
import { useAirplay } from "@/hooks/limeplay/use-airplay"
import { useMediaStore } from "@/hooks/limeplay/use-media"

/**
 * Opens the native AirPlay route picker.
 *
 * The button renders whenever the browser exposes the WebKit playback target
 * API. It highlights itself while the element is routed to a receiver and
 * dims when no receiver is reachable yet.
 */
export function AirPlayControl() {
  const { active, availability, showPicker, supported } = useAirplay()
  const mediaElement = useMediaStore((state) => state.mediaElement)

  // Some browsers report the WebKit playback target API differently, or
  // the element may not be attached to the store yet when first rendered.
  // Fall back to a direct check on the element or the document.
  const canShow =
    supported ||
    typeof (mediaElement as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void })
      ?.webkitShowPlaybackTargetPicker === "function"

  if (!canShow) return null

  const label = active
    ? "AirPlay is connected"
    : availability === "available"
      ? "AirPlay"
      : "AirPlay (no receiver found)"

  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? "bg-white text-black hover:bg-white/90"
          : availability === "unavailable"
            ? "text-white/60"
            : undefined
      }
      onClick={showPicker}
      size="icon"
      title={label}
      variant="glass"
    >
      <Airplay aria-hidden="true" className="size-4" strokeWidth={2} />
    </Button>
  )
}
