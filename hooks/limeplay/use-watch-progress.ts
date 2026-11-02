"use client"

import { useEffect, useRef } from "react"

import { usePlaylistStore } from "@/hooks/limeplay/use-playlist"
import { useMediaStore } from "@/hooks/limeplay/use-media"
import { useTimelineStore } from "@/hooks/limeplay/use-timeline"

interface WatchProgress {
  episodeId: number
  currentTime: number
  duration: number
  updatedAt: number
}

const STORAGE_KEY = "onepace-watch-progress"
const SAVE_INTERVAL_MS = 5000
const MIN_PROGRESS_TO_SAVE = 10

function getProgress(episodeId: number): WatchProgress | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<number, WatchProgress>
    return all[episodeId] ?? null
  } catch {
    return null
  }
}

function saveProgress(episodeId: number, progress: WatchProgress) {
  if (typeof window === "undefined") return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? (JSON.parse(raw) as Record<number, WatchProgress>) : {}
    all[episodeId] = progress
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
  }
}

function clearProgress(episodeId: number) {
  if (typeof window === "undefined") return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const all = JSON.parse(raw) as Record<number, WatchProgress>
    delete all[episodeId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
  }
}

function loadProgress(epId: number): number | null {
  const progress = getProgress(epId)
  if (!progress) return null
  if (progress.duration <= 0) return null
  if (progress.currentTime < MIN_PROGRESS_TO_SAVE) return null
  if (progress.currentTime >= progress.duration - 60) {
    clearProgress(epId)
    return null
  }
  return progress.currentTime
}

function saveProgressNow(epId: number, currentTime: number, duration: number) {
  if (currentTime < MIN_PROGRESS_TO_SAVE) return
  if (duration <= 0) return
  if (currentTime >= duration - 60) {
    clearProgress(epId)
    return
  }
  saveProgress(epId, {
    episodeId: epId,
    currentTime,
    duration,
    updatedAt: Date.now(),
  })
}

export function useWatchProgress() {
  const episodeId = usePlaylistStore((state) => state.currentItem?.properties?.episodeId)
  const mediaElement = useMediaStore((media) => media.mediaElement)
  const seek = useTimelineStore((timeline) => timeline.seek)

  const lastSavedTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!episodeId || !mediaElement) return

    const seekTime = loadProgress(episodeId as number)
    if (seekTime != null && mediaElement.readyState >= 1) {
      seek(seekTime)
    }

    const onTimeUpdate = () => {
      const now = Date.now()
      if (now - lastSavedTimeRef.current >= SAVE_INTERVAL_MS) {
        saveProgressNow(episodeId as number, mediaElement.currentTime, mediaElement.duration)
      }
    }

    mediaElement.addEventListener("timeupdate", onTimeUpdate)
    return () => {
      mediaElement.removeEventListener("timeupdate", onTimeUpdate)
      saveProgressNow(episodeId as number, mediaElement.currentTime, mediaElement.duration)
    }
  }, [episodeId, mediaElement, seek])

  return { loadProgress, saveProgressNow, clearProgress }
}

export function getWatchProgress(episodeId: number): WatchProgress | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<number, WatchProgress>
    return all[episodeId] ?? null
  } catch {
    return null
  }
}

export function clearWatchProgress(episodeId: number) {
  if (typeof window === "undefined") return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const all = JSON.parse(raw) as Record<number, WatchProgress>
    delete all[episodeId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
  }
}