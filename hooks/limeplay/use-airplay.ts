"use client"

import * as React from "react"

import { useAssetStore } from "@/hooks/limeplay/use-asset"
import { useMediaStore } from "@/hooks/limeplay/use-media"
import { isLoopbackHostname, withOrigin } from "@/lib/origin"

/**
 * WebKit playback target (AirPlay) extensions exposed by Safari on iOS,
 * iPadOS and macOS.
 */
export interface WebKitPlaybackTargetElement extends HTMLVideoElement {
  webkitCurrentPlaybackTargetIsWireless?: boolean
  webkitShowPlaybackTargetPicker?: () => void
}

/**
 * Availability of the native AirPlay route picker.
 *
 * - `unsupported` — the browser has no WebKit playback target API.
 * - `unavailable` — the API exists but no AirPlay receiver is reachable.
 * - `available` — at least one AirPlay receiver is reachable.
 */
export type AirplayAvailability =
  | "available"
  | "unavailable"
  | "unsupported"

/**
 * MIME type Safari expects for an AirPlay compatible alternative source.
 *
 * Safari only routes a media element to a receiver when it can hand the
 * receiver a real URL to fetch. MediaSource streams are binary blobs, so the
 * element needs a second, addressable source next to the MediaSource URL.
 */
const AIRPLAY_SOURCE_TYPE = "application/x-mpegURL"

/** Marks the `<source>` element carrying the AirPlay compatible URL. */
const AIRPLAY_SOURCE_ATTRIBUTE = "data-airplay-source"

/**
 * Last reported receiver availability per media element.
 *
 * Safari reports availability through the event payload only, so it has to be
 * cached to be readable from a snapshot.
 */
const reportedAvailability = new WeakMap<
  HTMLVideoElement,
  AirplayAvailability
>()

function isAirplayCapable(
  video: null | undefined | WebKitPlaybackTargetElement
): video is WebKitPlaybackTargetElement {
  return typeof video?.webkitShowPlaybackTargetPicker === "function"
}

/**
 * The availability probe that is armed on the element for the next click.
 *
 * Safari only reports receivers through an event, so the probe is armed
 * again on every click. Only one probe per element stays armed, otherwise
 * repeated clicks would pile up listeners that never fire.
 */
const armedAvailabilityProbe = new WeakMap<
  WebKitPlaybackTargetElement,
  (event: Event) => void
>()

function armAvailabilityProbe(
  video: WebKitPlaybackTargetElement,
  onAvailabilityChanged: () => void
): void {
  const armed = armedAvailabilityProbe.get(video)

  if (armed) {
    video.removeEventListener("webkitplaybacktargetavailabilitychanged", armed)
  }

  const handle = (event: Event) => {
    armedAvailabilityProbe.delete(video)
    applyAvailability(video, event)
    onAvailabilityChanged()
  }

  armedAvailabilityProbe.set(video, handle)

  video.addEventListener(
    "webkitplaybacktargetavailabilitychanged",
    handle,
    { once: true }
  )
}

/**
 * Screen wake lock that keeps a phone from locking its display while a
 * receiver plays the stream.
 *
 * Safari suspends a backgrounded page and pauses its media element. A
 * paused element stops feeding the receiver, so the wireless route is torn
 * down and the AirPlay session drops. Holding the screen awake prevents
 * the suspension in the first place.
 */
let wakeLock: null | WakeLockSentinel = null
let wakeLockRequest: null | Promise<void> = null

async function acquireWakeLock(): Promise<void> {
  if (typeof navigator === "undefined") return

  const api = navigator.wakeLock as undefined | WakeLock

  if (typeof api?.request !== "function") return
  if (wakeLock && !wakeLock.released) return

  wakeLockRequest ??= api
    .request("screen")
    .then((sentinel) => {
      wakeLock = sentinel

      sentinel.addEventListener("release", () => {
        if (wakeLock === sentinel) wakeLock = null
      })
    })
    .catch(() => {
      // The browser refuses the lock while the document is hidden or is not
      // allowed to hold one. The route is still kept alive by the playback
      // resume in that case.
    })
    .finally(() => {
      wakeLockRequest = null
    })

  await wakeLockRequest
}

function releaseWakeLock(): void {
  const sentinel = wakeLock
  wakeLock = null

  if (!sentinel) return

  void sentinel.release().catch(() => {})
}

/**
 * How long after the page was hidden a pause still counts as one the
 * browser caused on its own.
 *
 * Safari pauses the media element right after the page is backgrounded. A
 * pause that happens much later was asked for by the user, usually from the
 * lock screen, and must not be undone.
 */
const BACKGROUND_PAUSE_WINDOW_MS = 3000

/**
 * Resumes a routed element that is paused.
 *
 * Safari tears the wireless route down again when the element stays
 * paused, which leaves the receiver with an empty stream. Resuming the
 * element keeps the route alive and lets the receiver receive media.
 */
function resumeRoutedPlayback(video: WebKitPlaybackTargetElement): void {
  if (video.webkitCurrentPlaybackTargetIsWireless !== true) return
  if (!video.paused) return

  void video.play().catch(() => {})
}

/**
 * Resumes a routed element that the browser paused while the page was
 * backgrounded.
 *
 * Safari pauses the media element when the page is backgrounded or the
 * screen locks. The element stops feeding the receiver at that point, the
 * receiver runs out of media and the wireless route is dropped.
 *
 * Only a pause that follows the backgrounding within a short window is
 * undone, so a pause the user asks for later stays untouched.
 */
function resumeBackgroundedPlayback(
  video: WebKitPlaybackTargetElement,
  hiddenAt: number
): void {
  if (video.webkitCurrentPlaybackTargetIsWireless !== true) return
  if (!video.paused) return
  if (typeof document !== "undefined" && !document.hidden) return
  if (Date.now() - hiddenAt > BACKGROUND_PAUSE_WINDOW_MS) return

  void video.play().catch(() => {})
}

/**
 * Records the receiver availability Safari reports through an event.
 */
function applyAvailability(
  video: WebKitPlaybackTargetElement,
  event: Event
): void {
  const reported = (event as Event & { availability?: string }).availability

  reportedAvailability.set(
    video,
    reported === "available" ? "available" : "unavailable"
  )
}

function subscribeToAirplay(
  video: null | WebKitPlaybackTargetElement,
  onStoreChange: () => void
): () => void {
  if (!video) return () => {}

  const handleAvailabilityChanged = (event: Event) => {
    applyAvailability(video, event)
    onStoreChange()
  }

  const handleWirelessChanged = () => {
    const routed = video.webkitCurrentPlaybackTargetIsWireless === true

    if (routed) {
      // Safari tears the wireless route down again when the element stays
      // paused, which leaves the receiver with an empty stream. Resuming the
      // element keeps the route alive and lets the receiver receive media.
      resumeRoutedPlayback(video)

      // A screen wake lock stops the phone from locking its display, which
      // would suspend the page and take the route down with it.
      void acquireWakeLock()
    } else {
      releaseWakeLock()
    }

    onStoreChange()
  }

  // Safari pauses the element shortly after the page is backgrounded. The
  // moment the page was hidden tells a browser caused pause apart from one
  // the user asked for.
  let hiddenAt = 0

  const handlePause = () => {
    resumeBackgroundedPlayback(video, hiddenAt)
  }

  const handleVisibilityChanged = () => {
    if (document.hidden) {
      hiddenAt = Date.now()
      resumeBackgroundedPlayback(video, hiddenAt)
      return
    }

    hiddenAt = 0

    // A wake lock is released whenever the page is hidden, so it has to be
    // taken again as soon as the page comes back.
    if (video.webkitCurrentPlaybackTargetIsWireless === true) {
      void acquireWakeLock()
    }
  }

  video.addEventListener(
    "webkitplaybacktargetavailabilitychanged",
    handleAvailabilityChanged
  )
  video.addEventListener(
    "webkitcurrentplaybacktargetiswirelesschanged",
    handleWirelessChanged
  )
  video.addEventListener("pause", handlePause)
  document.addEventListener("visibilitychange", handleVisibilityChanged)

  if (video.webkitCurrentPlaybackTargetIsWireless === true) {
    void acquireWakeLock()
  }

  return () => {
    video.removeEventListener(
      "webkitplaybacktargetavailabilitychanged",
      handleAvailabilityChanged
    )
    video.removeEventListener(
      "webkitcurrentplaybacktargetiswirelesschanged",
      handleWirelessChanged
    )
    video.removeEventListener("pause", handlePause)
    document.removeEventListener("visibilitychange", handleVisibilityChanged)
    releaseWakeLock()
  }
}

function readAirplayAvailability(
  video: null | undefined | WebKitPlaybackTargetElement
): AirplayAvailability {
  if (!isAirplayCapable(video)) return "unsupported"

  return reportedAvailability.get(video) ?? "unavailable"
}

function readAirplayActive(
  video: null | undefined | WebKitPlaybackTargetElement
): boolean {
  return video?.webkitCurrentPlaybackTargetIsWireless === true
}

/**
 * Origin a remote device can use to reach this server.
 *
 * A receiver fetches the stream on its own network, so a page served from
 * `localhost` has to hand out a routable address instead. The server reports
 * the address it can be reached at.
 */
let publicOriginRequest: null | Promise<null | string> = null

function requestPublicOrigin(): Promise<null | string> {
  publicOriginRequest ??= fetch("/api/airplay-origin")
    .then((response) => response.json() as Promise<{ origin?: string }>)
    .then((data) =>
      typeof data.origin === "string" && data.origin ? data.origin : null
    )
    .catch(() => null)

  return publicOriginRequest
}

/**
 * Exposes the native AirPlay route picker for the active media element.
 *
 * The hook mirrors Safari's playback target contract:
 *
 * - `webkitplaybacktargetavailabilitychanged` reports whether a receiver is
 *   reachable, through the event's `availability` property.
 * - `webkitcurrentplaybacktargetiswirelesschanged` reports when playback
 *   starts or stops being routed to a receiver.
 * - `webkitShowPlaybackTargetPicker` opens the native picker and must be
 *   called from a user gesture.
 *
 * It also publishes the resolved manifest as an AirPlay compatible
 * alternative source, because a MediaSource object URL cannot be played by a
 * receiver.
 */
export function useAirplay() {
  const mediaElement = useMediaStore((state) => state.mediaElement)
  const resolvedSource = useAssetStore((state) => state.resolvedSource)

  const video = mediaElement as null | WebKitPlaybackTargetElement

  const notifyRef = React.useRef<null | (() => void)>(null)

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      notifyRef.current = onStoreChange

      const unsubscribe = subscribeToAirplay(video, onStoreChange)

      return () => {
        unsubscribe()
        if (notifyRef.current === onStoreChange) notifyRef.current = null
      }
    },
    [video]
  )
  const getAvailability = React.useCallback(
    () => readAirplayAvailability(video),
    [video]
  )
  const getActive = React.useCallback(() => readAirplayActive(video), [video])

  const availability = React.useSyncExternalStore(
    subscribe,
    getAvailability,
    () => (isAirplayCapable(video) ? "unavailable" : "unsupported")
  )
  const active = React.useSyncExternalStore(
    subscribe,
    getActive,
    () => false
  )

  const supported = availability !== "unsupported"
  const [publicOrigin, setPublicOrigin] = React.useState<null | string>(null)

  React.useEffect(() => {
    if (!supported) return
    if (!isLoopbackHostname(window.location.hostname)) return

    let cancelled = false

    void requestPublicOrigin().then((origin) => {
      if (cancelled) return

      setPublicOrigin(origin)
    })

    return () => {
      cancelled = true
    }
  }, [supported])

  React.useEffect(() => {
    const element = mediaElement

    if (!element || !resolvedSource) return
    if (!supported) return
    if (!isAirplayCapable(element as WebKitPlaybackTargetElement)) return

    const url = withOrigin(
      new URL(resolvedSource, window.location.href),
      publicOrigin
    )

    const syncAlternativeSource = () => {
      // The alternative source may only be offered once the element already
      // plays the MediaSource stream. While the element has no source at all
      // the browser would pick the manifest itself and start a second, native
      // playback session next to Shaka's.
      //
      // The MediaSource URL does not always live in the `src` attribute:
      // Shaka's `SrcEqualsPolyfill` moves it into a `<source>` child on
      // browsers without `src=` support for MediaSource.
      const primary = element.querySelector<HTMLSourceElement>(
        `source:not([${AIRPLAY_SOURCE_ATTRIBUTE}])`
      )

      if (!primary) return

      let source = element.querySelector<HTMLSourceElement>(
        `source[${AIRPLAY_SOURCE_ATTRIBUTE}]`
      )

      if (!source) {
        source = document.createElement("source")
        source.setAttribute(AIRPLAY_SOURCE_ATTRIBUTE, "")
        source.type = AIRPLAY_SOURCE_TYPE
      }

      if (source.getAttribute("src") !== url) {
        source.setAttribute("src", url)
      }

      // The browser plays the first source it can handle, so the manifest
      // has to stay behind the MediaSource source. Shaka replaces its own
      // source on every load, which would otherwise move the manifest to
      // the front and hand the local playback over to the browser's own
      // HLS support.
      if (primary.nextElementSibling !== source) {
        element.insertBefore(source, primary.nextElementSibling)
      }
    }

    syncAlternativeSource()

    // Shaka assigns the MediaSource object URL to the element when it loads
    // a stream, so the alternative source has to wait for that moment. The
    // polyfill publishes it as a `<source>` child instead.
    const observer = new MutationObserver(syncAlternativeSource)
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["src"],
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [mediaElement, resolvedSource, supported, publicOrigin])

  const showPicker = React.useCallback(() => {
    // The media store can lag behind the element that is actually on screen,
    // so the element is resolved again on every click. That way the picker
    // always opens for the element that is playing right now.
    const target =
      video ??
      document.querySelector<WebKitPlaybackTargetElement>("video")

    if (!isAirplayCapable(target)) return

    // Safari reports the reachable receivers through an event only, and it
    // fires that event for the element the picker belongs to. Re-arming the
    // probe here makes every click pick up the receiver list as it is at
    // that moment instead of relying on a cached reading.
    armAvailabilityProbe(target, () => notifyRef.current?.())

    try {
      target.webkitShowPlaybackTargetPicker?.()
    } catch (error) {
      console.warn(
        "[useAirplay] Failed to open the playback target picker",
        error
      )
    }
  }, [video])

  return {
    /** True when the browser exposes the WebKit playback target API. */
    supported,
    /** Current AirPlay route availability. */
    availability,
    /** True while the media element is routed to a wireless receiver. */
    active,
    /** Opens the native AirPlay route picker. */
    showPicker,
  }
}
