"use client"

import * as Select from "@/components/ui/select"
import * as PlaybackRate from "@/components/limeplay/playback-rate"

import { Button } from "./button"

export function PlaybackRateControl() {
  return (
    <PlaybackRate.SelectRoot>
      <Button
        asChild
        className="
          border-none bg-transparent shadow-none
          hover:bg-foreground/10
          dark:bg-transparent dark:shadow-none
        "
        variant="glass"
      >
        <Select.SelectTrigger>
          <Select.SelectValue />
        </Select.SelectTrigger>
      </Button>
      <Select.SelectContent
        align="start"
        className="min-w-28 border border-border backdrop-blur-lg"
        position="popper"
        side="top"
        sideOffset={12}
      >
        <PlaybackRate.SelectGroup className="tracking-wider">
          <Select.SelectLabel className="whitespace-nowrap">
            Playback Rate
          </Select.SelectLabel>
        </PlaybackRate.SelectGroup>
      </Select.SelectContent>
    </PlaybackRate.SelectRoot>
  )
}
