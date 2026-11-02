"use client"

import { useState } from "react"

import { Button } from "@/components/limeplay/video-player/components/button"
import { usePlayerStore } from "@/hooks/limeplay/use-player"
import { usePlayerTelemetry } from "@/hooks/limeplay/use-player-telemetry"
import { useTimelineStore } from "@/hooks/limeplay/use-timeline"
import * as TimelineSlider from "@/components/limeplay/timeline-control"
import {
  Duration,
  Elapsed,
  HoverTime,
  LiveLatency,
  Remaining,
} from "@/components/limeplay/timeline-labels"

const LIVE_DELAY_VISIBLE_SEC = 3

function formatThroughput(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null

  const megabits = (bytesPerSecond * 8) / 1_000_000

  if (megabits < 0.1) return null

  return `${megabits < 10 ? megabits.toFixed(1) : Math.round(megabits)} Mbps`
}

export function TimelineSliderControl() {
  const [showRemaining, setShowRemaining] = useState(false)
  const liveLatency = useTimelineStore((state) => state.liveLatency)
  const isLive = useTimelineStore((state) => state.isLive)
  const player = usePlayerStore((state) => state.instance)
  const { throughput } = usePlayerTelemetry(1000)
  const hasLiveLatency = liveLatency != null
  const showGoToLive = hasLiveLatency && liveLatency >= LIVE_DELAY_VISIBLE_SEC
  const showLiveBadge = hasLiveLatency && liveLatency < LIVE_DELAY_VISIBLE_SEC
  const throughputLabel = formatThroughput(throughput)

  return (
    <div
      className="
        flex w-full grow items-center gap-3 select-none
        @3xl/root:gap-4
      "
    >
      {!isLive && (
        <Elapsed className="w-[5ch] text-right text-xs/9 font-medium tabular-nums text-white/70" />
      )}
      <div className="group/timeline relative min-w-0 flex-1">
        <TimelineSlider.Root
          className={`
            group hit-area-x-[2px] hit-area-y-[14px] hit-area h-[3px] cursor-crosshair rounded-full transition-[height] duration-200 ease-out
            data-[orientation=horizontal]:h-[3px]
            group-hover/timeline:h-[5px]
            active:data-[orientation=horizontal]:h-[5px]
          `}
        >
          <TimelineSlider.Track className="overflow-hidden rounded-full bg-white/20">
            <TimelineSlider.Progress className="rounded-s-full bg-white" />
            <TimelineSlider.Buffered variant="combined" />
          </TimelineSlider.Track>
          <TimelineSlider.Thumb
            className={`
              absolute h-6 w-[3px] rounded-full bg-white opacity-0 transition-opacity duration-200
              group-hover/timeline:opacity-100
              group-active/timeline:bg-white
            `}
            showWithHover
          />
          <TimelineSlider.Thumb
            className={`
              top-auto! bottom-[calc(100%+14px)] flex h-auto w-fit bg-transparent text-xs font-medium tabular-nums text-white opacity-0 transition-opacity duration-200
              group-hover/timeline:opacity-100
            `}
            showWithHover
          >
            {isLive && <>&minus;</>}
            <HoverTime />
            {!isLive && (
              <>
                &nbsp;/&nbsp;
                <Duration className="text-white/50" />
              </>
            )}
          </TimelineSlider.Thumb>
        </TimelineSlider.Root>
      </div>
      {throughputLabel && (
        <span
          className="hidden text-[10px]/9 font-medium tabular-nums text-white/45 sm:inline"
          title="Network throughput"
        >
          {throughputLabel}
        </span>
      )}
      {!isLive && (
        <button
          aria-label={
            showRemaining ? "Show total duration" : "Show remaining time"
          }
          aria-pressed={showRemaining}
          className="
            inline-flex h-7 w-[6ch] cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors hover:text-white
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 focus-visible:outline-solid
          "
          onClick={() => {
            setShowRemaining(!showRemaining)
          }}
          tabIndex={0}
          type="button"
        >
          {showRemaining ? (
            <Remaining className="text-xs font-medium tabular-nums" />
          ) : (
            <Duration className="text-xs font-medium tabular-nums" />
          )}
        </button>
      )}
      {isLive && (
        <>
          {showGoToLive && player && (
            <>
              <LiveLatency className="text-xs font-medium" />
              <Button
                aria-label="Go to live"
                className="
                  cursor-pointer px-2
                  @md/root:px-2.5
                  @3xl/root:px-3
                "
                onClick={() => void player.goToLive()}
                size="sm"
                variant="glass"
              >
                <span className="text-xs font-medium text-white">
                  Go to live
                </span>
              </Button>
            </>
          )}
          {showLiveBadge && (
            <div className="flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold tracking-wide">
              <span className="tracking-widest">LIVE</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
