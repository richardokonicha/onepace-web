"use client"

import { useComposedRefs } from "@radix-ui/react-compose-refs"
import * as React from "react"

import { useMediaStore } from "@/hooks/limeplay/use-media"
import { usePlaybackStore } from "@/hooks/limeplay/use-playback"

export type MediaProps =
  | (React.AudioHTMLAttributes<HTMLAudioElement> & { as: "audio" })
  | (React.VideoHTMLAttributes<HTMLVideoElement> & {
      /**
       * Type of Media Element to Render
       *
       * @default video
       */
      as?: "video"
      /**
       * Controls whether the element may be routed to an AirPlay receiver.
       *
       * Safari only offers the route picker for elements that opt in.
       *
       * @default "allow"
       */
      "x-webkit-airplay"?: "allow" | "deny"
    })

export type MediaPropsDocs = Pick<MediaProps, "as">

export const Media = React.forwardRef<HTMLMediaElement, MediaProps>(
  (props, forwardedRef) => {
    const { as: Element = "video", ...etc } = props
    const setMediaElement = useMediaStore((state) => state.setMediaElement)
    const status = usePlaybackStore((state) => state.status)
    const composedRef = useComposedRefs(forwardedRef, setMediaElement)

    // Safari refuses the AirPlay route picker for elements that are not
    // allowed to play inline, and it only offers the picker when the element
    // explicitly opts into remote playback.
    const remotePlaybackProps =
      Element === "video"
        ? ({ playsInline: true, "x-webkit-airplay": "allow" } as const)
        : {}

    return (
      <Element
        aria-busy={status === "buffering" || status === "loading"}
        controls={false}
        {...remotePlaybackProps}
        {...etc}
        ref={composedRef}
      />
    )
  }
)

Media.displayName = "Media"
