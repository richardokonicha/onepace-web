"use client"

import type { VideoPlayerAsset } from "@/components/limeplay/video-player/player"

import { useAsset } from "@/hooks/limeplay/use-asset"
import { ControlsTopContainer } from "@/components/limeplay/player-layout"

export interface TopOverlayContainerProps {
  className?: string
}

/**
 * The understated title block.
 *
 * Hierarchy is deliberately light: the arc and episode sit on a single heavy
 * line, and the episode title supports it without competing.
 */
export function TopOverlayContainer({ className }: TopOverlayContainerProps) {
  const { currentItem } = useAsset<VideoPlayerAsset>()
  const asset = currentItem?.properties
  const description = asset?.description
  const title = asset?.title?.trim()
  const arc = asset?.arc?.trim()
  const episode = asset?.episode

  const heading =
    arc && episode
      ? `${arc} • Episode ${episode}`
      : arc || title

  const subtitle = arc && episode ? title : description

  if (!heading && !subtitle) return null

  return (
    <ControlsTopContainer className={className}>
      <div
        className="
          max-w-xs
          @3xl/root:max-w-md
        "
      >
        {heading && (
          <h2
            className="
              line-clamp-2 text-base/tight font-semibold tracking-tight text-balance text-white drop-shadow-[0_3px_18px_rgba(0,0,0,0.86)]
              @3xl/root:text-xl/tight
            "
          >
            {heading}
          </h2>
        )}
        {subtitle && (
          <p
            className="
              mt-1 line-clamp-1 max-w-sm text-xs/relaxed text-pretty text-white/70 drop-shadow-[0_2px_14px_rgba(0,0,0,0.78)]
              @3xl/root:line-clamp-2 @3xl/root:text-sm/relaxed
            "
          >
            {subtitle}
          </p>
        )}
      </div>
    </ControlsTopContainer>
  )
}
