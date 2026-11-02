"use client"

import type shaka from "shaka-player"

import * as React from "react"

import { useMediaStore } from "@/hooks/limeplay/use-media"
import { usePlayerStore } from "@/hooks/limeplay/use-player"

/**
 * Google's default media receiver application id. It accepts HLS and DASH
 * manifests over plain HTTP(S).
 */
export const DEFAULT_CAST_RECEIVER_APP_ID = "CC1AD845"

/**
 * The Chrome Cast sender SDK is not bundled with the player, it is loaded on
 * demand so the page never pays for it when nobody casts.
 */
const CAST_SENDER_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"

/**
 * Connection state of the external display route.
 *
 * - `unavailable` — no receiver stack is present on this device.
 * - `searching` — receivers are being discovered over the local network.
 * - `disconnected` — receivers were found but nothing is connected.
 * - `connected` — playback is routed to an external receiver.
 */
export type CastStatus =
  | "connected"
  | "disconnected"
  | "searching"
  | "unavailable"

export interface UseCastOptions {
  /** Receiver application id used for the Cast session. */
  receiverAppId?: string
}

interface ChromeCastApi {
  cast?: {
    isAvailable?: (options?: unknown) => boolean
  }
}

/**
 * Minimal shape of the Presentation API used for Miracast routing. The
 * TypeScript DOM library does not ship these types yet.
 */
interface PresentationConnection {
  close: () => Promise<void>
  send: (stream: MediaStream) => Promise<void>
}

interface PresentationSession {
  close: () => Promise<void>
  connection: PresentationConnection
  addEventListener: (type: "terminate", listener: () => void) => void
}

interface NavigatorPresentation {
  getAvailability: () => Promise<"available" | "unavailable">
  requestSession: () => Promise<PresentationSession>
}

declare global {
  interface Window {
    chrome?: ChromeCastApi
    __onGCastApiAvailable?: (available: boolean) => void
  }

  interface Navigator {
    presentation?: NavigatorPresentation
  }
}

let castSdkPromise: null | Promise<boolean> = null

/**
 * Loads the Chrome Cast sender SDK once per document.
 */
function loadCastSenderSdk(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)

  if (castSdkPromise) return castSdkPromise

  castSdkPromise = new Promise<boolean>((resolve) => {
    if (window.chrome?.cast?.isAvailable) {
      resolve(true)
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${CAST_SENDER_SDK_URL.split("?")[0]}"]`
    )

    const onReady = (available: boolean) => {
      if (available) {
        resolve(true)
        return
      }
      resolve(false)
    }

    const script = existing ?? document.createElement("script")

    script.addEventListener("load", () => {
      if (window.chrome?.cast?.isAvailable) {
        resolve(true)
        return
      }

      // The SDK calls `__onGCastApiAvailable` once the cast API is ready.
      const previous = window.__onGCastApiAvailable
      window.__onGCastApiAvailable = (available: boolean) => {
        previous?.(available)
        onReady(available)
      }
    })

    script.addEventListener("error", () => {
      resolve(false)
    })

    if (!existing) {
      script.src = CAST_SENDER_SDK_URL
      script.async = true
      document.head.appendChild(script)
    }
  })

  return castSdkPromise
}

type CastProxyConstructor = new (
  video: HTMLMediaElement,
  player: shaka.Player,
  receiverAppId: string,
  androidReceiverCompatible: boolean
) => shaka.cast.CastProxy

function getCastNamespace(): null | CastProxyConstructor {
  if (typeof window === "undefined") return null

  const namespace = window.shaka as unknown as {
    cast?: { CastProxy?: CastProxyConstructor }
  }

  if (typeof namespace?.cast?.CastProxy !== "function") return null

  return namespace.cast.CastProxy
}

/**
 * Manages external display routing for the active Limeplay player.
 *
 * Chromecast is handled by Shaka's own `CastProxy`, which replaces the local
 * player with a proxy that forwards every getter to the receiver while a
 * session is active. Miracast is handled through the browser Presentation API,
 * which is how Chromium exposes wireless display targets on Windows.
 */
export function useCast({ receiverAppId }: UseCastOptions = {}) {
  const mediaElement = useMediaStore((state) => state.mediaElement)
  const player = usePlayerStore((state) => state.instance)
  const setPlayerInstance = usePlayerStore((state) => state.setInstance)

  const [status, setStatus] = React.useState<CastStatus>("unavailable")
  const [deviceName, setDeviceName] = React.useState("")
  const [miracastAvailable, setMiracastAvailable] = React.useState(false)

  const proxyRef = React.useRef<null | shaka.cast.CastProxy>(null)
  const localPlayerRef = React.useRef<null | shaka.Player>(null)
  const presentationSessionRef = React.useRef<null | PresentationSession>(null)

  const syncStatus = React.useCallback(() => {
    const proxy = proxyRef.current

    if (!proxy) {
      setStatus("unavailable")
      return
    }

    if (proxy.isCasting()) {
      setStatus("connected")
      setDeviceName(proxy.receiverName())
      return
    }

    setDeviceName("")
    setStatus(proxy.canCast() ? "disconnected" : "searching")
  }, [])

  // Miracast discovery through the Presentation API.
  React.useEffect(() => {
    if (typeof window === "undefined") return

    const presentation = navigator.presentation
    if (!presentation) return

    let cancelled = false

    const poll = async () => {
      try {
        const availability = await presentation.getAvailability()
        if (cancelled) return

        setMiracastAvailable(availability === "available")

        setStatus((current) =>
          current === "connected" ? current : availability === "available"
            ? "disconnected"
            : "searching"
        )
      } catch {
        /* availability probing is best effort */
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 5000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  // Build the Cast proxy as soon as Shaka exposes a player and a video node.
  React.useEffect(() => {
    if (!mediaElement || !player) return
    if (proxyRef.current) return

    const CastProxy = getCastNamespace()
    if (!CastProxy) return

    let cancelled = false

    const build = async () => {
      const ready = await loadCastSenderSdk()
      if (cancelled) return

      if (!ready) {
        setStatus("unavailable")
        return
      }

      const video = mediaElement as HTMLVideoElement
      const proxy = new CastProxy(
        video,
        player,
        receiverAppId ?? DEFAULT_CAST_RECEIVER_APP_ID,
        false
      )

      proxyRef.current = proxy
      localPlayerRef.current = player

      proxy.addEventListener("caststatuschanged", () => {
        const isCasting = proxy.isCasting()

        if (isCasting) {
          // Route every Limeplay feature through the proxy so the timeline,
          // buffering and playback state follow the receiver.
          setPlayerInstance(proxy.getPlayer())
        } else if (proxyRef.current && localPlayerRef.current) {
          setPlayerInstance(localPlayerRef.current)
        }

        syncStatus()
      })

      syncStatus()
    }

    void build()

    return () => {
      cancelled = true
    }
  }, [mediaElement, player, receiverAppId, setPlayerInstance, syncStatus])

  React.useEffect(() => {
    return () => {
      const proxy = proxyRef.current
      proxyRef.current = null

      if (proxy) {
        void proxy.destroy(true).catch(() => {})
      }
    }
  }, [])

  const startCasting = React.useCallback(async () => {
    const proxy = proxyRef.current
    if (!proxy) return

    try {
      setStatus("searching")
      await proxy.cast()
      syncStatus()
    } catch (error) {
      console.error("[useCast] Failed to start the cast session", error)
      syncStatus()
    }
  }, [syncStatus])

  const stopCasting = React.useCallback(() => {
    const proxy = proxyRef.current

    if (proxy) {
      proxy.forceDisconnect()
      syncStatus()
      return
    }

    const session = presentationSessionRef.current
    if (session) {
      void session.close().catch(() => {})
      presentationSessionRef.current = null
      setStatus("disconnected")
    }
  }, [syncStatus])

  const startMiracast = React.useCallback(async () => {
    if (typeof window === "undefined") return

    const presentation = navigator.presentation
    if (!presentation) return

    const video = mediaElement as HTMLVideoElement & {
      captureStream?: () => MediaStream
      mozCaptureStream?: () => MediaStream
    }

    const capture = video.captureStream ?? video.mozCaptureStream
    if (!capture) return

    try {
      const session = await presentation.requestSession()
      presentationSessionRef.current = session

      const stream = capture.call(video)
      await session.connection.send(stream)

      setStatus("connected")
      setDeviceName("Miracast display")

      session.addEventListener("terminate", () => {
        presentationSessionRef.current = null
        setDeviceName("")
        setStatus("disconnected")
      })
    } catch (error) {
      console.error("[useCast] Failed to start the Miracast session", error)
      setStatus("disconnected")
    }
  }, [mediaElement])

  const isCasting = status === "connected"

  return {
    /** Current routing state of the external display. */
    status,
    /** Name of the connected receiver, when any. */
    deviceName,
    /** True while playback is routed to an external receiver. */
    isCasting,
    /** True when a receiver stack exists on this device. */
    supported: status !== "unavailable",
    /** True when at least one receiver is reachable over the local network. */
    hasReceiver: status === "disconnected" || status === "connected",
    /** True when a Miracast display was reported by the Presentation API. */
    miracastAvailable,
    /** Starts a Chromecast session through Shaka's CastProxy. */
    startCasting,
    /** Mirrors the video to a Miracast display through the Presentation API. */
    startMiracast,
    /** Disconnects the active external display session. */
    stopCasting,
  }
}
