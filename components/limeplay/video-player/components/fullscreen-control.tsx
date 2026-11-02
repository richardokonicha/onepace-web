"use client"

import { ArrowsInIcon, ArrowsOutIcon } from "@phosphor-icons/react"

import { Button } from "@/components/limeplay/video-player/components/button"
import { useFullscreen } from "@/hooks/limeplay/use-fullscreen"

/**
 * Toggles the full screen presentation of the player.
 */
export function FullscreenControl() {
  const { active, supported, toggle } = useFullscreen()

  if (!supported) return null

  return (
    <Button
      aria-label={active ? "Exit full screen" : "Enter full screen"}
      aria-pressed={active}
      className="cursor-pointer"
      onClick={toggle}
      size="icon"
      variant="glass"
    >
      {active ? (
        <ArrowsInIcon weight="bold" />
      ) : (
        <ArrowsOutIcon weight="bold" />
      )}
    </Button>
  )
}
