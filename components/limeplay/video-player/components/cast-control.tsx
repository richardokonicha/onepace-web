"use client"

import { Cast, MonitorUp } from "lucide-react"

import { Button } from "@/components/limeplay/video-player/components/button"
import { useCast } from "@/hooks/limeplay/use-cast"

/**
 * Routes playback to an external receiver.
 *
 * Chromecast is handled through the Cast Web Sender SDK and Google's default
 * media receiver, which keeps every Limeplay feature in sync with the
 * receiver. Miracast is handled through the browser Presentation API, which is
 * how Chromium exposes wireless display targets on Windows. The icon reflects
 * the live connection state: searching, connected or disconnected.
 */
export function CastControl() {
  const {
    castError,
    chromecastAvailable,
    deviceName,
    isCasting,
    miracastAvailable,
    startCasting,
    startMiracast,
    status,
    stopCasting,
  } = useCast()

  if (!chromecastAvailable && !miracastAvailable) return null

  // Miracast is the fallback for browsers without Chromecast receivers.
  const useMiracast = !chromecastAvailable && miracastAvailable

  const label = isCasting
    ? `Disconnect from ${deviceName || "external display"}`
    : castError
      ? castError
      : status === "searching"
        ? "Searching for a receiver"
        : "Cast to a device"

  const handleClick = () => {
    if (isCasting) {
      void stopCasting()
      return
    }

    if (useMiracast) {
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
      disabled={!isCasting && !useMiracast && status === "searching"}
      onClick={handleClick}
      size="icon"
      title={label}
      variant="glass"
    >
      {useMiracast ? (
        <MonitorUp aria-hidden="true" className="size-4" strokeWidth={2} />
      ) : (
        <Cast aria-hidden="true" className="size-4" strokeWidth={2} />
      )}
    </Button>
  )
}
