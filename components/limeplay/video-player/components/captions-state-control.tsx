"use client"

import { ClosedCaptioningIcon } from "@phosphor-icons/react"

import { Button } from "@/components/limeplay/video-player/components/button"
import { useCaptionsStore } from "@/hooks/limeplay/use-captions"
import { CaptionsControl } from "@/components/limeplay/captions"

export function CaptionsStateControl() {
  const textTrackVisible = useCaptionsStore((state) => state.visible)
  const textTracks = useCaptionsStore((state) => state.tracks)

  // A stream without text tracks has nothing to toggle, so the button is
  // removed instead of sitting there greyed out.
  if (textTracks && textTracks.length === 0) {
    return null
  }

  return (
    <CaptionsControl asChild>
      <Button className="cursor-pointer" size="icon" variant="glass">
        <ClosedCaptioningIcon weight={textTrackVisible ? "fill" : "bold"} />
      </Button>
    </CaptionsControl>
  )
}
