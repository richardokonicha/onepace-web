"use client"

import React from "react"

import { cn } from "@/lib/utils"

export interface TelevisionOverlayBrand {
  /** Channel mark, drawn above the wordmark. */
  mark?: React.ReactNode
  /** Upper wordmark line. */
  primary: string
  /** Lower wordmark line. */
  secondary?: string
}

export interface TelevisionOverlayBadge {
  label: string
  /**
   * `live` uses the red broadcast colour, `accent` the gold channel colour.
   *
   * @default "live"
   */
  tone?: "accent" | "live"
}

export interface TelevisionOverlayProps {
  /** Pill shown above the title, for example a live badge. */
  badge?: TelevisionOverlayBadge
  /** Channel bug in the top left corner. */
  brand?: TelevisionOverlayBrand
  className?: string
  /** Wall clock, for example `12:51`. */
  clock?: string
  /** Elapsed playback time in seconds, rendered as `00:42:27`. */
  elapsed?: number
  /** Renders the red live badge. */
  live?: boolean
  /** Secondary line under the title. */
  subtitle?: string
  /** Programme title. */
  title?: string
  /** Weather readout in the top right corner. */
  weather?: {
    icon?: React.ReactNode
    temperature?: string
  }
}

/**
 * The broadcast overlay drawn on top of the screen.
 *
 * It carries programme information only. Transport controls stay with the
 * player that owns the playback state, so there is never a second set of
 * controls fighting over the same media element.
 */
export function TelevisionOverlay({
  badge,
  brand,
  className,
  clock,
  elapsed,
  live = false,
  subtitle,
  title,
  weather,
}: TelevisionOverlayProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 flex flex-col justify-between p-[4.8%_5.6%_clamp(11rem,32%,12rem)] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.4)]",
        "max-[700px]:p-[4%_4.5%_4%]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {brand ? <ChannelBrand brand={brand} /> : null}
        {clock || weather ? (
          <div className="flex items-center gap-[7px] text-[clamp(9px,1vw,12px)] font-medium tracking-wide">
            {clock ? <span className="tabular-nums">{clock}</span> : null}
            {weather?.icon}
            {weather?.temperature ? <span>{weather.temperature}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex max-[700px]:hidden flex-col items-start gap-1">
        {live ? (
          <span className="flex items-center gap-[5px] rounded-[2px] bg-[var(--tv-live)] px-2 py-1 text-[clamp(8px,0.85vw,11px)] leading-none font-bold tracking-wide uppercase">
            <span className="size-[5px] rounded-full bg-white/90" />
            Live
          </span>
        ) : null}
        {badge ? (
          <span
            className={cn(
              "rounded-[2px] px-2 py-1 text-[clamp(8px,0.85vw,11px)] leading-none font-bold tracking-wide uppercase",
              badge.tone === "accent"
                ? "bg-[var(--tv-accent)] text-black"
                : "bg-[var(--tv-live)] text-white"
            )}
          >
            {badge.label}
          </span>
        ) : null}
        {title ? (
          <h2 className="mt-1 text-[clamp(13px,1.45vw,19px)] leading-[1.1] font-bold">
            {title}
          </h2>
        ) : null}
        {subtitle ? (
          <p className="m-0 text-[clamp(9px,0.95vw,12px)] text-white/80">
            {subtitle}
          </p>
        ) : null}
        {typeof elapsed === "number" && elapsed > 0 ? (
          <p className="m-0 mt-1 text-[clamp(11px,1.1vw,14px)] font-medium text-white/90 tabular-nums">
            {formatElapsed(elapsed)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The channel bug: a gold mark with the wordmark underneath.
 */
function ChannelBrand({ brand }: { brand: TelevisionOverlayBrand }) {
  return (
    <div className="flex flex-col items-start leading-none">
      {brand.mark ?? (
        <span className="mb-[3px] h-[25px] w-[19px] border-2 border-[var(--tv-accent)]" />
      )}
      <small className="text-[7px] font-bold tracking-[0.05em]">
        {brand.primary}
      </small>
      {brand.secondary ? (
        <b className="text-[9px] font-bold">{brand.secondary}</b>
      ) : null}
    </div>
  )
}

/**
 * Formats a duration as `hh:mm:ss`.
 */
export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remainder = safe % 60

  return [hours, minutes, remainder]
    .map((part) => String(part).padStart(2, "0"))
    .join(":")
}
