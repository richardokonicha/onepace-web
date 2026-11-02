"use client"

import * as React from "react"

import { useAssetStore } from "@/hooks/limeplay/use-asset"
import { useMediaStore } from "@/hooks/limeplay/use-media"
import { usePlaylistStore } from "@/hooks/limeplay/use-playlist"

/**
 * Google's default media receiver application id.
 *
 * The receiver fetches the manifest URL it is handed and plays it with its
 * own controls. Shaka's own cast receiver application is no longer hosted,
 * so the Shaka specific protocol cannot be used here.
 */
export const DEFAULT_CAST_RECEIVER_APP_ID = "CC1AD845"

/**
 * The Chrome Cast sender SDK is not bundled with the player, it is loaded on
 * demand so the page never pays for it when nobody casts.
 */
const CAST_SENDER_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"

/**
 * How long to wait for the Cast sender SDK to come up. The SDK is fetched
 * from a third party, so it can be slow or blocked entirely.
 */
const CAST_SDK_TIMEOUT_MS = 10000

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

interface CastDevice {
  friendlyName?: string
  name?: string
}

interface CastSession {
  getCastDevice?: () => CastDevice | null
  getId?: () => string
  loadMedia: (request: CastMediaRequest) => Promise<void>
  stopCasting?: () => Promise<void>
}

interface CastMediaRequest {
  contentId: string
  contentType: string
  metadata?: { title?: string; subtitle?: string }
  streamType?: "BUFFERED" | "LIVE"
}

interface CastContext {
  addEventListener: (
    type: string,
    listener: (event: { castState: string }) => void
  ) => void
  endCurrentSession: (stopCasting?: boolean) => Promise<void>
  getCastState: () => string
  getCurrentSession: () => CastSession | null
  requestSession: () => Promise<CastSession>
  setOptions: (options: {
    autoJoinPolicy?: string
    receiverApplicationId: string
  }) => void
}

interface CastFramework {
  CastContext: { getInstance: () => CastContext }
  CastContextEventType: { CAST_STATE_CHANGED: string }
  CastState: {
    CONNECTED: string
    CONNECTING: string
    NO_DEVICES_AVAILABLE: string
    NOT_CASTING: string
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
    cast?: { framework?: CastFramework }
    __onGCastApiAvailable?: (available: boolean) => void
  }

  interface Navigator {
    presentation?: NavigatorPresentation
  }
}

let castSdkPromise: null | Promise<boolean> = null

/**
 * Whether the Cast framework finished loading.
 *
 * The sender SDK ships in several pieces. The framework that exposes
 * `CastContext` arrives last, and only then is a session request possible.
 */
function castFrameworkReady(): boolean {
  if (typeof window === "undefined") return false

  return typeof window.cast?.framework?.CastContext === "function"
}

/**
 * Loads the Chrome Cast sender SDK once per document.
 *
 * Resolves `true` once the framework is usable. The SDK notifies through the
 * `__onGCastApiAvailable` global, which has to be installed *before* the
 * script is injected because the SDK calls it exactly once.
 */
function loadCastSenderSdk(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)

  if (castSdkPromise) return castSdkPromise

  castSdkPromise = new Promise<boolean>((resolve) => {
    let settled = false
    let poll = 0

    const settle = (available: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.clearInterval(poll)
      // Allow a later attempt to retry when the SDK never came up.
      if (!available) castSdkPromise = null
      resolve(available)
    }

    const timer = window.setTimeout(() => settle(false), CAST_SDK_TIMEOUT_MS)

    const previous = window.__onGCastApiAvailable
    window.__onGCastApiAvailable = (available: boolean) => {
      previous?.(available)
      // The notification can arrive before the framework is exposed, so the
      // poll below decides when the SDK is actually usable.
      if (available && castFrameworkReady()) settle(true)
    }

    if (castFrameworkReady()) {
      settle(true)
      return
    }

    // The framework is loaded by the SDK in the background, so poll for it in
    // case the notification arrives before the framework is exposed.
    poll = window.setInterval(() => {
      if (castFrameworkReady()) settle(true)
    }, 100)

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${CAST_SENDER_SDK_URL.split("?")[0]}"]`
    )

    const script = existing ?? document.createElement("script")

    script.addEventListener("load", () => {
      if (castFrameworkReady()) settle(true)
    })

    script.addEventListener("error", () => {
      settle(false)
    })

    if (!existing) {
      script.src = CAST_SENDER_SDK_URL
      script.async = true
      document.head.appendChild(script)
    }
  })

  return castSdkPromise
}

/**
 * Turns a playback source into an absolute URL.
 *
 * The receiver runs on another device and fetches the manifest itself, so a
 * relative proxy path is useless for it.
 */
function absoluteSourceUrl(source: string): string {
  try {
    return new URL(source, window.location.origin).href
  } catch {
    return source
  }
}

/**
 * Picks the content type the receiver should use for a source.
 */
function sourceContentType(source: string): string {
  return source.includes("/api/proxy/mp4") ? "video/mp4" : "application/x-mpegurl"
}

/**
 * Maps a Cast SDK failure to a message that makes sense in the UI.
 */
function describeCastError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : ""

  switch (code) {
    case "cancel":
      return "The cast request was cancelled."
    case "timeout":
      return "No receiver answered in time."
    case "receiver_unavailable":
      return "The receiver is no longer available."
    default:
      return "Could not start the cast session."
  }
}

function stringProperty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/**
 * Manages external display routing for the active Limeplay player.
 *
 * Chromecast is handled through the Cast Web Sender SDK and Google's default
 * media receiver, which plays the manifest URL directly. Miracast is handled
 * through the browser Presentation API, which is how Chromium exposes
 * wireless display targets on Windows.
 */
export function useCast({ receiverAppId }: UseCastOptions = {}) {
  const mediaElement = useMediaStore((state) => state.mediaElement)
  const resolvedSource = useAssetStore((state) => state.resolvedSource)
  const title = usePlaylistStore((state) =>
    stringProperty(state.currentItem?.properties?.title)
  )

  const [chromecastState, setChromecastState] = React.useState<CastStatus>(
    "unavailable"
  )
  const [miracastState, setMiracastState] = React.useState<CastStatus>(
    "unavailable"
  )
  const [deviceName, setDeviceName] = React.useState("")
  const [castError, setCastError] = React.useState("")

  const contextRef = React.useRef<null | CastContext>(null)
  const sessionRef = React.useRef<null | CastSession>(null)
  const presentationSessionRef = React.useRef<null | PresentationSession>(null)

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

        setMiracastState(
          availability === "available" ? "disconnected" : "unavailable"
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

  // Chromecast discovery and session handling through the Cast SDK.
  React.useEffect(() => {
    let cancelled = false

    const setup = async () => {
      const ready = await loadCastSenderSdk()
      if (cancelled) return

      const framework = window.cast?.framework
      if (!ready || !framework) {
        setChromecastState("unavailable")
        return
      }

      const context = framework.CastContext.getInstance()
      contextRef.current = context

      context.setOptions({
        receiverApplicationId: receiverAppId ?? DEFAULT_CAST_RECEIVER_APP_ID,
        autoJoinPolicy: "origin_scoped",
      })

      const applyState = (castState: string) => {
        if (cancelled) return

        switch (castState) {
          case framework.CastState.CONNECTED: {
            const device = context.getCurrentSession()?.getCastDevice?.()
            setDeviceName(device?.friendlyName ?? device?.name ?? "")
            setChromecastState("connected")
            return
          }
          case framework.CastState.CONNECTING:
            setChromecastState("searching")
            return
          case framework.CastState.NO_DEVICES_AVAILABLE:
            setDeviceName("")
            setChromecastState("unavailable")
            return
          default:
            setDeviceName("")
            setChromecastState("disconnected")
        }
      }

      context.addEventListener(
        framework.CastContextEventType.CAST_STATE_CHANGED,
        (event) => applyState(event.castState)
      )

      applyState(context.getCastState())
    }

    void setup()

    return () => {
      cancelled = true
    }
  }, [receiverAppId])

  const status = React.useMemo<CastStatus>(() => {
    if (chromecastState === "connected" || miracastState === "connected") {
      return "connected"
    }

    if (chromecastState === "disconnected" || miracastState === "disconnected") {
      return "disconnected"
    }

    if (chromecastState === "searching") return "searching"

    return "unavailable"
  }, [chromecastState, miracastState])

  const startCasting = React.useCallback(async () => {
    const context = contextRef.current

    if (!context) {
      setCastError("Casting is not available on this device.")
      return
    }

    if (!resolvedSource) {
      setCastError("This episode is not ready to cast yet.")
      return
    }

    setCastError("")
    setChromecastState("searching")

    try {
      const session = await context.requestSession()
      sessionRef.current = session

      await session.loadMedia({
        contentId: absoluteSourceUrl(resolvedSource),
        contentType: sourceContentType(resolvedSource),
        streamType: "BUFFERED",
        ...(title ? { metadata: { title } } : {}),
      })

      // The receiver takes over, so the local copy has to stay quiet.
      const video = mediaElement as null | HTMLVideoElement
      if (video && !video.paused) video.pause()
    } catch (error) {
      sessionRef.current = null
      setCastError(describeCastError(error))
      setChromecastState("disconnected")
    }
  }, [mediaElement, resolvedSource, title])

  const stopCasting = React.useCallback(async () => {
    const context = contextRef.current

    if (context) {
      try {
        await context.endCurrentSession(true)
      } catch {
        /* the session may already be gone */
      }

      sessionRef.current = null
      setCastError("")
      setChromecastState("disconnected")
      return
    }

    const session = presentationSessionRef.current
    if (session) {
      void session.close().catch(() => {})
      presentationSessionRef.current = null
      setMiracastState("disconnected")
    }
  }, [])

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

      setMiracastState("connected")
      setDeviceName("Miracast display")

      session.addEventListener("terminate", () => {
        presentationSessionRef.current = null
        setDeviceName("")
        setMiracastState("unavailable")
      })
    } catch (error) {
      console.error("[useCast] Failed to start the Miracast session", error)
      setMiracastState("disconnected")
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
    /** True when at least one Chromecast receiver is reachable. */
    chromecastAvailable: chromecastState !== "unavailable",
    /** True when a Miracast display was reported by the Presentation API. */
    miracastAvailable: miracastState !== "unavailable",
    /** Human readable reason of the last failed cast attempt. */
    castError,
    /** Starts a Chromecast session through the Cast Web Sender SDK. */
    startCasting,
    /** Mirrors the video to a Miracast display through the Presentation API. */
    startMiracast,
    /** Disconnects the active external display session. */
    stopCasting,
  }
}
