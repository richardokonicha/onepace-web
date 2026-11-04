"use client"

import React from "react"

import { cn } from "@/lib/utils"
import { type TVThemeName, tvThemeStyle } from "@/components/tv/tv-theme"

export interface TelevisionFrameProps {
  /** Screen content, normally the video player. */
  children: React.ReactNode
  className?: string
  /**
   * Vertical alignment of the television inside the room.
   *
   * @default "start"
   */
  align?: "center" | "start"
  /** Renders the media console furniture below the television. */
  console?: boolean
  /** Renders the plant silhouette in the left corner of the room. */
  plant?: boolean
  /** Applies the restrained room perspective to the television. */
  perspective?: boolean
  /** Renders the floating soundbar below the television. */
  soundbar?: boolean
  /** Extra inline styles, merged with the theme variables. */
  style?: React.CSSProperties
  /**
   * Visual theme of the room.
   *
   * @default "reference"
   */
  theme?: TVThemeName
}

/**
 * A television mounted on an architectural wall.
 *
 * The frame is pure presentation: it owns the room, the lighting, the chassis
 * and the furniture, and leaves the screen to whatever is rendered as its
 * children. Every colour and gradient comes from the theme tokens, so the
 * room can be re-skinned without touching the component.
 */
export function TelevisionFrame({
  align = "start",
  children,
  className,
  console: showConsole = false,
  plant: showPlant = true,
  perspective = true,
  soundbar: showSoundbar = true,
  style,
  theme = "reference",
}: TelevisionFrameProps) {
  return (
    <section
      aria-label="Living room television"
      className={cn(
        "relative isolate flex min-h-[var(--tv-room-min-height,clamp(410px,54vw,700px))] w-full justify-center overflow-hidden rounded-[3px] px-[clamp(12px,5vw,68px)] pt-[clamp(38px,6vw,82px)] pb-[120px] [perspective:1800px]",
        align === "center" ? "items-center" : "items-start",
        "max-[700px]:px-[10px] max-[700px]:pt-[40px] max-[700px]:pb-[75px]",
        className
      )}
      style={{ ...tvThemeStyle(theme), ...style }}
    >
      <RoomWall />
      {showPlant ? <RoomPlant /> : null}

      <div className="relative z-20 w-full max-w-[1040px] [transform-style:preserve-3d]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[3%] top-[5%] bottom-[-12%] -z-20 rounded-[50%] bg-[var(--tv-cast-shadow)] blur-[43px] [transform:translate3d(0,30px,-35px)_scale(.97)] max-[700px]:blur-[27px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[6%] top-[12%] bottom-[-2%] -z-20 rounded-[50%] bg-[var(--tv-contact-shadow)] opacity-70 blur-[18px] max-[700px]:blur-[12px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-[5%] -top-[12%] -bottom-[5%] -z-30 rounded-[50%] bg-[radial-gradient(ellipse_at_50%_48%,var(--tv-halo),var(--tv-halo-outer)_42%,transparent_72%)] blur-[48px] [transform:translateZ(-45px)] max-[700px]:blur-[30px]"
        />

        <div
          className={cn(
            "[transform-style:preserve-3d]",
            perspective
              ? "[transform:rotateY(-0.55deg)_rotateX(0.22deg)] motion-reduce:[transform:none]"
              : "[transform:none]",
            "max-[700px]:[transform:none]"
          )}
        >
          <div
            className="
              relative w-full rounded-[5px/4px] border border-[var(--tv-chassis-edge)] bg-[var(--tv-chassis)] p-[3px]
              shadow-[0_36px_54px_var(--tv-cast-shadow),0_18px_27px_rgba(9,15,18,0.25),0_5px_12px_rgba(0,0,0,0.36),0_0_42px_rgba(212,229,237,0.12),inset_0_1px_1px_rgba(255,255,255,0.23),inset_0_-2px_3px_rgba(0,0,0,0.9)]
              [transform:translateZ(10px)]
              max-[700px]:rounded-[3px] max-[700px]:p-[2px]
              max-[700px]:shadow-[0_20px_32px_rgba(0,0,0,0.34),0_5px_12px_rgba(0,0,0,0.25)]
            "
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-[5%] right-[5%] z-20 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.34),transparent)]"
            />
            <div className="relative aspect-video w-full overflow-hidden rounded-[2px] bg-[var(--tv-screen)] shadow-[inset_0_0_14px_rgba(0,0,0,0.55),inset_0_1px_2px_rgba(255,255,255,0.08)]">
              {children}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-30 bg-[linear-gradient(112deg,rgba(255,255,255,0.055),transparent_18%,transparent_78%,rgba(255,255,255,0.025))] shadow-[inset_0_0_18px_rgba(0,0,0,0.13)]"
              />
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -bottom-[3px] h-[2px] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]"
            />
          </div>
        </div>

        {showSoundbar ? <Soundbar /> : null}
      </div>

      {showConsole ? <MediaConsole /> : null}
    </section>
  )
}

/**
 * The architectural wall: paint, pooled light, panel seam and edge falloff.
 */
function RoomWall() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-50 bg-[radial-gradient(ellipse_at_50%_36%,var(--tv-wall-glow),transparent_58%),linear-gradient(108deg,var(--tv-wall-panel),transparent_42%,var(--tv-wall-vignette)),linear-gradient(180deg,var(--tv-wall-top),var(--tv-wall-base)_58%,var(--tv-wall-bottom))]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[9%] left-[7%] -z-40 h-[48%] w-[42%] rounded-full bg-[var(--tv-wall-light-left)] blur-[55px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[15%] right-[5%] -z-40 h-[43%] w-[36%] rounded-full bg-[var(--tv-wall-light-right)] blur-[55px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-[8%] -z-40 w-px bg-[linear-gradient(180deg,transparent,var(--tv-wall-panel)_18%,var(--tv-wall-panel)_82%,transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-30 bg-[radial-gradient(ellipse_at_50%_38%,transparent_42%,var(--tv-wall-vignette)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-30 h-[38%] bg-[linear-gradient(0deg,var(--tv-wall-bottom),transparent_62%)]"
      />
    </>
  )
}

/**
 * A low contrast plant silhouette. It frames the composition without
 * competing with the screen.
 */
function RoomPlant() {
  const leaves = [
    "left-[5px] top-0 -rotate-[32deg] scale-[0.8]",
    "left-[33px] top-[22px] rotate-[28deg] scale-[0.9]",
    "left-[-5px] top-[65px] -rotate-[48deg]",
    "left-[37px] top-[87px] rotate-[38deg] scale-[0.95]",
    "left-[-8px] top-[135px] -rotate-[38deg] scale-[0.85]",
    "left-[38px] top-[151px] rotate-[35deg] scale-[0.8]",
  ]

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-[20%] -left-[14px] z-10 h-[210px] w-[95px] opacity-64 drop-shadow-[7px_12px_9px_rgba(0,0,0,0.22)] max-[700px]:scale-[0.7] max-[700px]:opacity-22 max-[700px]:[transform-origin:left_top]"
    >
      {leaves.map((leaf) => (
        <span
          key={leaf}
          className={cn(
            "absolute h-[82px] w-[45px] rounded-[100%_0_100%_0] border border-[rgba(205,220,203,0.12)] bg-[linear-gradient(135deg,var(--tv-plant-leaf),var(--tv-plant-leaf-dark))] [transform-origin:bottom_right]",
            leaf
          )}
        />
      ))}
    </div>
  )
}

/**
 * The floating soundbar, sized to 58% of the television width.
 */
function Soundbar() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto mt-[clamp(22px,3.5vw,42px)] h-[clamp(18px,3.3vw,34px)] w-[58%] rounded-[2px] border border-[var(--tv-soundbar-edge)] bg-[var(--tv-soundbar)] shadow-[0_17px_25px_rgba(0,0,0,0.29),0_5px_9px_rgba(0,0,0,0.22),inset_0_1px_1px_rgba(255,255,255,0.1)]"
    >
      <div className="absolute inset-[5px_9px] opacity-55 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.035)_0_1px,transparent_1px_3px)]" />
    </div>
  )
}

/**
 * The media console the television stands above.
 */
function MediaConsole() {
  return (
    <div aria-hidden="true" className="absolute inset-x-[3.5%] bottom-0 z-10 h-[13%] max-[700px]:h-[10%]">
      <div className="h-[12px] rounded-t-[2px] bg-[var(--tv-console-top)] shadow-[0_-5px_18px_rgba(0,0,0,0.1)]" />
      <div className="grid h-[calc(100%_-_12px)] grid-cols-3 border-x border-white/55 bg-[var(--tv-console-front)]">
        <span className="border-r border-[rgba(139,149,154,0.32)] shadow-[inset_1px_0_rgba(255,255,255,0.28)]" />
        <span className="border-r border-[rgba(139,149,154,0.32)] shadow-[inset_1px_0_rgba(255,255,255,0.28)]" />
        <span />
      </div>
    </div>
  )
}
