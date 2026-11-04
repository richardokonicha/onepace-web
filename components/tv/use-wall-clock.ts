"use client"

import React from "react"

const CLOCK_INTERVAL_MS = 30_000

let clockSnapshot = 0
let clockTimer: number | null = null
const clockListeners = new Set<() => void>()

/**
 * Subscribes to the wall clock.
 *
 * The clock is stored outside React so the component never renders a time
 * that the server did not render, which keeps hydration clean.
 */
function subscribeClock(onStoreChange: () => void) {
  clockListeners.add(onStoreChange)

  if (clockTimer === null && typeof window !== "undefined") {
    clockSnapshot = Date.now()
    clockTimer = window.setInterval(() => {
      clockSnapshot = Date.now()
      clockListeners.forEach((listener) => listener())
    }, CLOCK_INTERVAL_MS)
  }

  return () => {
    clockListeners.delete(onStoreChange)

    if (clockListeners.size === 0 && clockTimer !== null) {
      window.clearInterval(clockTimer)
      clockTimer = null
    }
  }
}

function getClockSnapshot() {
  return clockSnapshot
}

function getServerClockSnapshot() {
  return 0
}

/**
 * The current wall clock.
 *
 * Returns `null` while the component is server rendered or hydrating, so the
 * caller can render a stable placeholder instead of a mismatching time.
 */
export function useWallClock(): Date | null {
  const now = React.useSyncExternalStore(
    subscribeClock,
    getClockSnapshot,
    getServerClockSnapshot
  )

  return now === 0 ? null : new Date(now)
}

/**
 * Formats a date as a 24 hour wall clock, for example `12:51`.
 */
export function formatWallClock(date: Date | null): string | undefined {
  if (!date) return undefined

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")

  return `${hours}:${minutes}`
}
