"use client"

import * as React from "react"

import { usePlayerStore } from "@/hooks/limeplay/use-player"

interface FullscreenCapableElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

interface FullscreenCapableDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenElement?: Element | null
}

export interface UseFullscreenReturn {
  /** True while the player is presented full screen. */
  active: boolean
  /** Presents the player full screen. */
  enter: () => void
  /** Leaves the full screen presentation. */
  exit: () => void
  /** True when the browser exposes a full screen API. */
  supported: boolean
  /** Toggles the full screen presentation. */
  toggle: () => void
}

/**
 * Drives the full screen presentation of the player.
 *
 * The player root is the full screen target, so the video and its controls
 * stay visible instead of only the video surface. Safari still ships the
 * prefixed API on some versions, so both spellings are supported.
 */
export function useFullscreen(): UseFullscreenReturn {
  const container = usePlayerStore((state) => state.containerRef)
  const [active, setActive] = React.useState(false)

  // The capability is probed on the client only, so the first client render
  // matches the server markup. Probing during render makes the control appear
  // out of nowhere and breaks hydration.
  const supported = React.useSyncExternalStore(
    subscribeToFullscreenSupport,
    getFullscreenSupportSnapshot,
    getServerFullscreenSupportSnapshot
  )

  React.useEffect(() => {
    const onFullscreenChange = () => {
      const doc = document as FullscreenCapableDocument
      const element = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null

      setActive(element === container)
    }

    document.addEventListener("fullscreenchange", onFullscreenChange)
    document.addEventListener("webkitfullscreenchange", onFullscreenChange)
    onFullscreenChange()

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange)
    }
  }, [container])

  const enter = React.useCallback(() => {
    if (!container) return

    const element = container as FullscreenCapableElement
    const request = element.requestFullscreen ?? element.webkitRequestFullscreen

    if (!request) return

    try {
      const result = request.call(element)

      if (result && typeof result.catch === "function") {
        void result.catch(() => {})
      }
    } catch {
      return
    }
  }, [container])

  const exit = React.useCallback(() => {
    const doc = document as FullscreenCapableDocument
    const request = doc.exitFullscreen ?? doc.webkitExitFullscreen

    if (!request) return

    try {
      const result = request.call(doc)

      if (result && typeof result.catch === "function") {
        void result.catch(() => {})
      }
    } catch {
      return
    }
  }, [])

  const toggle = React.useCallback(() => {
    const doc = document as FullscreenCapableDocument
    const element = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null

    if (element) {
      exit()
      return
    }

    enter()
  }, [enter, exit])

  return { active, enter, exit, supported, toggle }
}

function getFullscreenSupportSnapshot(): boolean {
  const element = document.documentElement as FullscreenCapableElement

  return (
    typeof element.requestFullscreen === "function" ||
    typeof element.webkitRequestFullscreen === "function"
  )
}

function getServerFullscreenSupportSnapshot(): boolean {
  return false
}

function subscribeToFullscreenSupport(): () => void {
  return noop
}

function noop() {}
