"use client";

import { useCallback, useEffect, useRef } from "react";

type PrefetchBridge = {
  prefetch: (episodeId: number) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    __onePacePrefetch?: PrefetchBridge;
  }
}

/**
 * Starts the playback prefetch for an episode.
 *
 * The actual chain lives in the bootstrap script that is inlined into the
 * document, because a pointer can reach a card before React has hydrated
 * and that first interaction would otherwise be lost. When the bridge is
 * available the work is shared with it; otherwise the hook falls back to
 * walking the chain itself.
 */
export function usePrefetchResolve(episodeId: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefetch = useCallback(() => {
    if (!Number.isFinite(episodeId) || episodeId <= 0) return;
    const bridge = typeof window !== "undefined" ? window.__onePacePrefetch : undefined;
    if (bridge) {
      bridge.prefetch(episodeId);
      return;
    }
    void prefetchChain(episodeId);
  }, [episodeId]);

  const schedulePrefetch = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      prefetch();
    }, 120);
  }, [prefetch]);

  const cancelPrefetch = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const bridge = typeof window !== "undefined" ? window.__onePacePrefetch : undefined;
    bridge?.cancel();
  }, []);

  useEffect(() => cancelPrefetch, [cancelPrefetch]);

  return { prefetch, schedulePrefetch, cancelPrefetch };
}

type ResolveResponse = {
  candidates?: { type?: string; proxyUrl?: string }[];
};

async function touch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function drain(url: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    await res.arrayBuffer();
  } catch {
    return;
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

async function prefetchChain(episodeId: number): Promise<void> {
  const resolve = await touch(`/api/resolve?id=${episodeId}`);
  if (!resolve) return;

  let masterPath: string | undefined;
  try {
    const data = JSON.parse(resolve) as ResolveResponse;
    masterPath = data.candidates?.find((c) => c.type === "hls")?.proxyUrl;
  } catch {
    return;
  }
  if (!masterPath) return;

  const master = await touch(masterPath);
  if (!master) return;

  const playlistPath = firstUrls(master, 1)[0];
  if (!playlistPath) return;

  const playlist = await touch(playlistPath);
  if (!playlist) return;

  const segments = firstUrls(playlist, 1);
  setTimeout(() => {
    for (const segment of segments) void drain(segment);
  }, 700);
}
