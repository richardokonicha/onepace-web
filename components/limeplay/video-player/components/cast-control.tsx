"use client"

import { Cast, MonitorUp } from "lucide-react"

import { Button } from "@/components/limeplay/video-player/components/button"
import { useCast } from "@/hooks/limeplay/use-cast"

/**
 * Routes playback to an external receiver.
 *
 * Chromecast is handled by Shaka's `CastProxy`, which keeps every Limeplay
 * feature in sync with the receiver. Miracast is handled through the browser
 * Presentation API, which is how Chromium exposes wireless display targets.
 * The icon reflects the live connection state: searching, connected or
 * disconnected.
 */
export function CastControl() {
  const {
    deviceName,
    isCasting,
    miracastAvailable,
    startCasting,
    startMiracast,
    status,
    stopCasting,
    supported,
  } = useCast()

  if (!supported && !miracastAvailable) return null

  const label = isCasting
    ? `Disconnect from ${deviceName || "external display"}`
    : status === "searching"
      ? "Searching for a receiver"
      : "Cast to a device"

  const handleClick = () => {
    if (isCasting) {
      stopCasting()
      return
    }

    if (miracastAvailable) {
      void startMiracast()
      return
    }

    void startCasting()
  }

  return (
    <Button
      aria-label={label}
      aria-pressed={isCasting}
      className={
        isCasting
          ? "bg-white text-black hover:bg-white/90"
          : status === "searching"
            ? "text-white"
            : undefined
      }
      onClick={handleClick}
      size="icon"
      title={label}
      variant="glass"
    >
      {miracastAvailable ? (
        <MonitorUp aria-hidden="true" className="size-4" strokeWidth={2} />
      ) : (
        <Cast aria-hidden="true" className="size-4" strokeWidth={2} />
      )}
    </Button>
  )
}
