"use client"

import * as React from "react"

import { useFullscreen } from "@/hooks/limeplay/use-fullscreen"
import { usePlayerStore } from "@/hooks/limeplay/use-player"
import { useTimelineStore } from "@/hooks/limeplay/use-timeline"

/** Amount of seconds the arrow key shortcuts jump. */
export const SHORTCUT_SKIP_SECONDS = 10

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  if (target.isContentEditable) return true

  const tag = target.tagName

  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true

  // The timeline slider owns the arrow keys while it is focused.
  return target.closest('[role="slider"]') !== null
}

/**
 * Keyboard shortcuts for the player.
 *
 * - `ArrowLeft` and `ArrowRight` jump backwards and forwards.
 * - `F` toggles the full screen presentation.
 *
 * The shortcuts only apply while the player owns the keyboard focus, so the
 * rest of the page keeps its native key handling.
 */
export function usePlayerShortcuts(): void {
  const container = usePlayerStore((state) => state.containerRef)
  const skip = useTimelineStore((state) => state.skip)
  const { toggle } = useFullscreen()

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTextInput(event.target)) return

      const activeElement = document.activeElement
      const playerHasFocus =
        activeElement === null || activeElement === document.body
          ? true
          : Boolean(container?.contains(activeElement))

      if (!playerHasFocus) return

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        skip(-SHORTCUT_SKIP_SECONDS)
        return
      }

      if (event.key === "ArrowRight") {
        event.preventDefault()
        skip(SHORTCUT_SKIP_SECONDS)
        return
      }

      if (event.key === "f" || event.key === "F") {
        event.preventDefault()
        toggle()
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [container, skip, toggle])
}
