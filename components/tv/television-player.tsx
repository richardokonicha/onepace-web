"use client"

import React from "react"

import {
  type VideoPlayerAsset,
  VideoPlayer,
  type VideoPlayerProps,
} from "@/components/limeplay/video-player/player"
import {
  TelevisionFrame,
  type TelevisionFrameProps,
} from "@/components/tv/television-frame"
import {
  TelevisionOverlay,
  type TelevisionOverlayProps,
} from "@/components/tv/television-overlay"
import { formatWallClock, useWallClock } from "@/components/tv/use-wall-clock"
import { useAsset } from "@/hooks/limeplay/use-asset"
import { useTimelineStore } from "@/hooks/limeplay/use-timeline"

export interface TelevisionPlayerProps extends VideoPlayerProps {
  /**
   * Broadcast overlay configuration.
   *
   * Every field falls back to the live playback state, so the overlay can be
   * enabled without any wiring. Pass `false` to hide it.
   *
   * @default true
   */
  overlay?: boolean | TelevisionOverlayProps
  /** Room, chassis and furniture options. */
  frame?: Omit<TelevisionFrameProps, "children">
}

const DEFAULT_BRAND: TelevisionOverlayProps["brand"] = {
  primary: "ONE",
  secondary: "PACE",
}

/**
 * The television frame wrapped around the existing player.
 *
 * The playback engine is untouched: the same `VideoPlayer` block renders
 * inside the screen, so Shaka, the media session, captions, AirPlay and the
 * progress tracking all keep working exactly as before. The frame only owns
 * the room around it.
 */
export function TelevisionPlayer({
  children,
  frame,
  overlay = true,
  ...playerProps
}: TelevisionPlayerProps) {
  const overlayProps =
    overlay === false ? null : overlay === true ? {} : overlay

  return (
    <TelevisionFrame {...frame}>
      <VideoPlayer
        {...playerProps}
        layout="fill"
        showTopOverlay={playerProps.showTopOverlay ?? false}
      >
        {children}
        {overlayProps ? <TelevisionOverlayController {...overlayProps} /> : null}
      </VideoPlayer>
    </TelevisionFrame>
  )
}

TelevisionPlayer.displayName = "TelevisionPlayer"

/**
 * Binds the broadcast overlay to the live player state.
 *
 * It renders inside the player tree, so it can read the asset and timeline
 * stores without lifting any playback state out of the media provider.
 */
function TelevisionOverlayController({
  badge,
  brand,
  className,
  clock,
  elapsed,
  live,
  subtitle,
  title,
  weather,
}: TelevisionOverlayProps) {
  const { currentItem } = useAsset<VideoPlayerAsset>()
  const currentTime = useTimelineStore((state) => state.currentTime)
  const wallClock = useWallClock()
  const properties = currentItem?.properties

  const defaultBadge =
    typeof properties?.episode === "number"
      ? { label: `Ep ${properties.episode}`, tone: "accent" as const }
      : undefined

  const defaultSubtitle = [properties?.arc, properties?.year]
    .filter(Boolean)
    .join(" · ")

  return (
    <TelevisionOverlay
      badge={badge ?? defaultBadge}
      brand={brand ?? DEFAULT_BRAND}
      className={className}
      clock={clock ?? formatWallClock(wallClock)}
      elapsed={elapsed ?? currentTime}
      live={live ?? false}
      subtitle={subtitle ?? (defaultSubtitle || undefined)}
      title={title ?? properties?.title}
      weather={weather}
    />
  )
}
