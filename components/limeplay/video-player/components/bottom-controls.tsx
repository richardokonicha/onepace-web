import { AirPlayControl } from "@/components/limeplay/video-player/components/airplay-control"
import { CaptionsStateControl } from "@/components/limeplay/video-player/components/captions-state-control"
import { CastControl } from "@/components/limeplay/video-player/components/cast-control"
import { FullscreenControl } from "@/components/limeplay/video-player/components/fullscreen-control"
import { PictureInPictureControl } from "@/components/limeplay/video-player/components/pip-control"
import { PlaybackStateControl } from "@/components/limeplay/video-player/components/playback-state-control"
import { Playlist } from "@/components/limeplay/video-player/components/playlist"
import { PlaylistNextControl } from "@/components/limeplay/video-player/components/playlist-navigation-controls"
import { SkipControl } from "@/components/limeplay/video-player/components/skip-control"
import { TimelineSliderControl } from "@/components/limeplay/video-player/components/timeline-slider-control"
import { VolumeGroupControl } from "@/components/limeplay/video-player/components/volume-group-control"
import { CONTROLS_FORCE_VISIBLE_ATTRIBUTE } from "@/hooks/limeplay/use-controls-visibility"
import * as Layout from "@/components/limeplay/player-layout"

export interface BottomControlsProps {
  className?: string
}

/**
 * The suspended tray.
 *
 * The controls live in a floating glass panel that is detached from the
 * viewport edges, with the scrubber on its own row and the actions clustered
 * underneath, mirroring the Apple TV player chrome.
 */
export function BottomControls({ className }: BottomControlsProps) {
  return (
    <Layout.ControlsBottomContainer
      className={className}
      {...{ [CONTROLS_FORCE_VISIBLE_ATTRIBUTE]: "" }}
    >
      <div
        className="
          mx-auto flex w-full max-w-4xl flex-col gap-1 rounded-2xl
          bg-zinc-950/40 px-3 py-2 backdrop-blur-xl backdrop-saturate-150
          shadow-[0_18px_60px_-18px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.12)]
          ring-1 ring-white/10
          @md/root:gap-1.5 @md/root:px-4 @md/root:py-2.5
        "
      >
        <TimelineSliderControl />

        <div
          className="
            grid grid-cols-[1fr_auto] items-center gap-2
            @3xl/root:grid-cols-[1fr_auto_1fr]
          "
        >
          <div
            className="
              col-start-1 row-start-1 flex flex-row items-center gap-1.5 justify-self-start
              @3xl/root:col-start-1 @3xl/root:row-start-1
            "
          >
            <SkipControl direction="backward" />
            <PlaybackStateControl />
            <SkipControl direction="forward" />
            <PlaylistNextControl />
            <VolumeGroupControl />
          </div>

          <div
            className="
              col-start-2 row-start-1 flex flex-row items-center gap-1.5 justify-self-end
              @3xl/root:col-start-3 @3xl/root:row-start-1
            "
          >
            <CaptionsStateControl />
            <PictureInPictureControl />
            <CastControl />
            <AirPlayControl />
            <FullscreenControl />
            <Playlist />
          </div>
        </div>
      </div>
    </Layout.ControlsBottomContainer>
  )
}
