"use client";

import { useCallback, useEffect, useRef } from "react";

const prefetched = new Set<string>();

type ResolveResponse = {
  candidates?: { type?: string; proxyUrl?: string }[];
};

/** Pulls a URL and discards the body, leaving it in the browser cache. */
async function touch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function touchBinary(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    await res.arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

function firstUrls(text: string, limit: number): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) continue;
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Walks the playback chain the way the player does: resolve, master
 * playlist, media playlist. Every hop lands in the browser cache, so the
 * player starts from a warm cache instead of waiting on the network.
 */
async function prefetchChain(episodeId: number): Promise<string[]> {
  const resolve = await touch(`/api/resolve?id=${episodeId}`);
  if (!resolve) return [];

  let masterPath: string | undefined;
  try {
    const data = JSON.parse(resolve) as ResolveResponse;
    masterPath = data.candidates?.find((c) => c.type === "hls")?.proxyUrl;
  } catch {
    return [];
  }
  if (!masterPath) return [];

  const master = await touch(masterPath);
  if (!master) return [];

  const playlistPath = firstUrls(master, 1)[0];
  if (!playlistPath) return [];

  const playlist = await touch(playlistPath);
  if (!playlist) return [];

  return firstUrls(playlist, 1);
}

export function usePrefetchResolve(episodeId: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segments = useRef<string[]>([]);

  const cancelPrefetch = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (segmentTimer.current) {
      clearTimeout(segmentTimer.current);
      segmentTimer.current = null;
    }
  }, []);

  const prefetch = useCallback(() => {
    if (!Number.isFinite(episodeId) || episodeId <= 0) return;
    const key = `ep:${episodeId}`;
    if (prefetched.has(key)) return;
    prefetched.add(key);

    void prefetchChain(episodeId)
      .then((found) => {
        segments.current = found;
        // Pull the leading segment only once the pointer has rested on the
        // card. It is several megabytes, so a quick pass over the grid must
        // not trigger it.
        if (segmentTimer.current) clearTimeout(segmentTimer.current);
        segmentTimer.current = setTimeout(() => {
          segmentTimer.current = null;
          void Promise.all(segments.current.map((s) => touchBinary(s)));
        }, 700);
      })
      .catch(() => {
        prefetched.delete(key);
      });
  }, [episodeId]);

  const schedulePrefetch = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      prefetch();
    }, 120);
  }, [prefetch]);

  useEffect(() => cancelPrefetch, [cancelPrefetch]);

  return { prefetch, schedulePrefetch, cancelPrefetch };
}
