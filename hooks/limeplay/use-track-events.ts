import clamp from "lodash.clamp"
import * as React from "react"

export interface UseTrackEventsProps<E extends HTMLElement> {
  /** Progress is 0-1 based on the width of the bar and the pointer event, clamped */
  onPointerDown: (progress: number, event: React.PointerEvent<E>) => void
  /**
   * Progress is 0-1 based on the width of the bar and the pointer event, clamped
   * Fires on every move, even if the pointer is not down, use isPointerDown to disambiguate
   */
  onPointerMove: (
    progress: number,
    isPointerDown: boolean,
    event: React.PointerEvent<E>
  ) => void
  /**  */
  onPointerOut?: (event: React.PointerEvent<E>) => void
  /**  */
  onPointerUp?: (event: React.PointerEvent<E>) => void
  /** Orientation of the track. @default "horizontal" */
  orientation?: "horizontal" | "vertical"
}

export interface UseTrackEventsReturn<E extends HTMLElement> {
  onPointerDown: (e: React.PointerEvent<E>) => void
  onPointerMove: (e: React.PointerEvent<E>) => void
  onPointerOut: (e: React.PointerEvent<E>) => void
  onPointerUp: (e: React.PointerEvent<E>) => void
  onPointerCancel: (e: React.PointerEvent<E>) => void
}

/** Events for a track/slider bar */
export function useTrackEvents<E extends HTMLElement>(
  props: UseTrackEventsProps<E>
): UseTrackEventsReturn<E> {
  const {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerOut: handlePointerOut,
    onPointerUp: handlePointerUp,
    orientation = "horizontal",
  } = props

  const getProgress = React.useCallback(
    (e: React.PointerEvent<E>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      let value: number

      if (orientation === "vertical") {
        value = 1 - (e.clientY - rect.top) / e.currentTarget.offsetHeight
      } else {
        value = (e.clientX - rect.left) / e.currentTarget.offsetWidth
      }

      return clamp(value, 0, 1)
    },
    [orientation]
  )

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent<E>) => {
      // Ignore non-left clicks
      if (e.button !== 0) {
        return
      }

      e.stopPropagation()
      e.preventDefault()

      // The capture can fail when the pointer is already gone, which must
      // not break the drag handling.
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // The pointer is not active anymore, so there is nothing to capture.
      }
      const value = getProgress(e)
      const progress = clamp(value, 0, 1)
      handlePointerDown(progress, e)
    },
    [handlePointerDown, getProgress]
  )

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent<E>) => {
      e.stopPropagation()
      e.preventDefault()

      const value = getProgress(e)
      const progress = clamp(value, 0, 1)
      handlePointerMove(
        progress,
        e.currentTarget.hasPointerCapture(e.pointerId),
        e
      )
    },
    [handlePointerMove, getProgress]
  )

  const releaseCapture = React.useCallback((e: React.PointerEvent<E>) => {
    // The capture is only taken for the primary button, so it can be absent
    // when the pointer is released. Releasing it anyway throws.
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // The pointer was already released, so the capture is gone.
    }
  }, [])

  const onPointerUp = React.useCallback(
    (e: React.PointerEvent<E>) => {
      e.stopPropagation()
      e.preventDefault()

      releaseCapture(e)
      handlePointerUp?.(e)
    },
    [handlePointerUp, releaseCapture]
  )

  const onPointerCancel = React.useCallback(
    (e: React.PointerEvent<E>) => {
      e.stopPropagation()
      e.preventDefault()

      // A cancelled drag has to end like a finished one. Without this the
      // pointer capture stays active and every later pointer move keeps
      // seeking or changing the volume.
      releaseCapture(e)
      handlePointerUp?.(e)
    },
    [handlePointerUp, releaseCapture]
  )

  const onPointerOut = React.useCallback(
    (e: React.PointerEvent<E>) => {
      e.stopPropagation()
      e.preventDefault()

      handlePointerOut?.(e)
    },
    [handlePointerOut]
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerOut,
    onPointerUp,
    onPointerCancel,
  }
}
