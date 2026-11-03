"use client"

import { Airplay } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/limeplay/video-player/components/button"
import { useAirplay } from "@/hooks/limeplay/use-airplay"

const emptySubscribe = () => () => {}

/**
 * Opens the native AirPlay route picker.
 *
 * The button is always rendered. Safari only exposes the playback target
 * API once the media element is attached, so hiding the control whenever
 * that API is missing would make it disappear for the whole first paint of
 * an episode and never come back on browsers that report the API late.
 *
 * Every click resolves the media element again and re-arms the receiver
 * probe, so the native picker always lists the receivers that are reachable
 * at that moment.
 */
export function AirPlayControl() {
  const { active, availability, showPicker } = useAirplay()

  // The server cannot know the browser's playback target support, so the
  // first render has to stay identical on both sides of the hydration.
  const hydrated = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  const connected = hydrated && active
  const available = availability === "available"

  const label = connected
    ? "AirPlay is connected"
    : available
      ? "AirPlay"
      : !hydrated
        ? "AirPlay"
        : availability === "unsupported"
          ? "AirPlay (not supported by this browser)"
          : "AirPlay (no receiver found)"

  return (
    <Button
      aria-label={label}
      aria-pressed={connected}
      className={
        connected
          ? "bg-white text-black hover:bg-white/90"
          : available
            ? undefined
            : "text-white/60"
      }
      data-label="lp-airplay-control"
      onClick={showPicker}
      size="icon"
      title={label}
      variant="glass"
    >
      <Airplay aria-hidden="true" className="size-4" strokeWidth={2} />
    </Button>
  )
}
