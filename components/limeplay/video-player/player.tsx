"use client"

import React from "react"

import type { PlaybackSourceControllerProps } from "@/hooks/limeplay/use-playback-source"

import { cn } from "@/lib/utils"
import { BottomControls } from "@/components/limeplay/video-player/components/bottom-controls"
import { VideoMediaSessionController } from "@/components/limeplay/video-player/components/media-session-controller"
import { PlayerErrorScreen } from "@/components/limeplay/video-player/components/player-error-screen"
import {
  PlayerRootContainer,
  type PlayerRootContainerLayout,
} from "@/components/limeplay/video-player/components/player-root-container"
import { TopOverlayContainer } from "@/components/limeplay/video-player/components/top-overlay-container"
import { MediaProvider } from "@/components/limeplay/video-player/lib/media-kit"
import { type TAsset, useAsset } from "@/hooks/limeplay/use-asset"
import { PlaybackSourceController } from "@/hooks/limeplay/use-playback-source"
import { useFullscreen } from "@/hooks/limeplay/use-fullscreen"
import { useTimelineStore } from "@/hooks/limeplay/use-timeline"
import { usePlayerStore } from "@/hooks/limeplay/use-player"
import { useWatchProgress } from "@/hooks/limeplay/use-watch-progress"
import { CaptionsContainer } from "@/components/limeplay/captions"
import { FallbackPoster } from "@/components/limeplay/fallback-poster"
import { Media } from "@/components/limeplay/media"
import * as Layout from "@/components/limeplay/player-layout"

import "./styles.css"

export interface VideoPlayerAsset extends TAsset {
  /** Arc label, for example `Arc 36`. */
  arc?: string
  /** Episode number inside the arc. */
  episode?: number
  /** One Pace episode id, used to lazily resolve the stream URL. */
  episodeId?: number
  description?: string
  poster?: string
  title?: string
  year?: string
}

export interface VideoPlayerProps
  extends PlaybackSourceControllerProps<VideoPlayerAsset> {
  children?: React.ReactNode
  className?: string
  debug?: boolean
  /**
   * Controls how the player frame gets its size.
   *
   * `aspect` keeps the default 16:9 box. `fill` lets a height-constrained
   * parent own the player size.
   *
   * @default "aspect"
   */
  layout?: PlayerRootContainerLayout
  /**
   * Props to pass to the underlying video element.
   */
  mediaProps?: Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "as" | "src">
  /**
   * The player surface is always dark, the prop is kept for API parity with
   * the upstream block.
   *
   * @default dark
   */
  theme?: "dark" | "light"
}

const SHORTCUT_SKIP_SECONDS = 10

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return target.closest('[role="slider"]') !== null
}

function PlayerShortcuts() {
  const container = usePlayerStore((state) => state.containerRef)
  const skip = useTimelineStore((state) => state.skip)
  const { toggle } = useFullscreen()

  React.useEffect(() => {
    if (!container) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTextInput(event.target)) return

      const activeElement = document.activeElement
      const playerHasFocus =
        activeElement === null || activeElement === document.body
          ? true
          : container.contains(activeElement)

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
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [container, skip, toggle])

return null
}

export const VideoPlayer = React.forwardRef<HTMLDivElement, VideoPlayerProps>(
  function VideoPlayer(
    {
      autoLoad,
      children,
      className,
      debug,
      initialIndex,
      layout = "aspect",
      loading,
      mediaProps,
      source,
      sourceKey,
    },
    ref
  ) {
    const containerRef = React.useRef<HTMLDivElement>(null)

    const composedRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      },
      [ref]
    )

    return (
      <MediaProvider debug={debug}>
        <PlayerRootContainer
          className={cn("dark bg-black text-white", className)}
          layout={layout}
          ref={composedRef}
        >
          <WatchProgressProvider />
          <PlayerShortcuts />
          <PlaybackSourceController
            autoLoad={autoLoad}
            initialIndex={initialIndex}
            loading={loading}
            source={source}
            sourceKey={sourceKey}
          />
          <VideoMediaSessionController />
          <PlayerErrorScreen
            initialIndex={initialIndex}
            loading={loading}
            source={source}
            sourceKey={sourceKey}
          />
          <Layout.PlayerContainer className="size-full min-h-0 bg-black">
            <FallbackPoster className="bg-black">
              <CurrentAssetPoster />
            </FallbackPoster>
            <CurrentAssetMedia {...(mediaProps ?? {})} />
            {children}
            <Layout.ControlsOverlayContainer
              className="
                bg-linear-[to_top,var(--lp-controls-fade-stops)] bg-size-[100%_80%] bg-top bg-no-repeat transition-opacity duration-300 ease-out
                group-data-[idle=true]/root:opacity-0
                group-data-[status=buffering]/root:opacity-100
                group-data-[status=error]/root:opacity-100
                group-data-[status=paused]/root:opacity-100
              "
            />
            <Layout.ControlsOverlayContainer
              className="
                bg-linear-[to_bottom,var(--lp-controls-fade-stops)] bg-size-[100%_45%] bg-bottom bg-no-repeat transition-opacity duration-300 ease-out
                group-data-[idle=true]/root:opacity-0
                group-data-[status=buffering]/root:opacity-100
                group-data-[status=error]/root:opacity-100
                group-data-[status=paused]/root:opacity-100
              "
            />
            <Layout.ControlsContainer
              className={`
                mx-auto w-full
                @3xl/root:max-w-6xl
                @5xl/root:max-w-[1728px]
              `}
            >
              <TopOverlayContainer
                className="
                  px-[5%] pt-[clamp(0.75rem,7svh,4rem)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]
                  group-data-[idle=false]/root:translate-y-0 group-data-[idle=false]/root:opacity-100
                  group-data-[idle=true]/root:-translate-y-4 group-data-[idle=true]/root:opacity-0 group-data-[idle=true]/root:pointer-events-none
                  group-data-[status=buffering]/root:translate-y-0 group-data-[status=buffering]/root:opacity-100
                  group-data-[status=error]/root:translate-y-0 group-data-[status=error]/root:opacity-100
                  group-data-[status=paused]/root:translate-y-0 group-data-[status=paused]/root:opacity-100
                  @3xl/root:px-[min(80px,10%)]
                "
              />
              <CaptionsContainer
                className="
                  px-[5%] pb-[clamp(0.5rem,4svh,1.5rem)]
                  @3xl/root:px-[min(80px,10%)]
                "
              />
              <BottomControls
                className="
                  px-[5%] pb-[clamp(0.75rem,7svh,4rem)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]
                  group-data-[idle=false]/root:translate-y-0 group-data-[idle=false]/root:opacity-100
                  group-data-[idle=true]/root:translate-y-4 group-data-[idle=true]/root:opacity-0 group-data-[idle=true]/root:pointer-events-none
                  group-data-[status=buffering]/root:translate-y-0 group-data-[status=buffering]/root:opacity-100
                  group-data-[status=error]/root:translate-y-0 group-data-[status=error]/root:opacity-100
                  group-data-[status=paused]/root:translate-y-0 group-data-[status=paused]/root:opacity-100
                  @3xl/root:px-[min(80px,10%)]
                "
              />
            </Layout.ControlsContainer>
          </Layout.PlayerContainer>
        </PlayerRootContainer>
      </MediaProvider>
    )
  }
)

VideoPlayer.displayName = "VideoPlayer"

function CurrentAssetMedia({
  className,
  poster,
  ...mediaProps
}: NonNullable<VideoPlayerProps["mediaProps"]>) {
  const { currentItem } = useAsset<VideoPlayerAsset>()
  const currentPoster = currentItem?.properties.poster

  return (
    <Media
      {...(mediaProps as React.ComponentPropsWithoutRef<typeof Media>)}
      as="video"
      className={cn("size-full bg-black object-contain", className)}
      poster={poster ?? currentPoster}
    />
  )
}

function CurrentAssetPoster() {
  const { currentItem } = useAsset<VideoPlayerAsset>()
  const poster = currentItem?.properties.poster

  if (!poster) {
    return (
      <div className="text-sm font-medium tracking-tight text-white/40">
        One Pace
      </div>
    )
  }

  return (
    <img
      alt=""
      className="size-full object-cover opacity-60"
      loading="lazy"
      src={poster}
    />
  )
}

function WatchProgressProvider() {
  useWatchProgress()
  return null
}