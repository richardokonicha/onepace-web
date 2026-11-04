"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";

import type { VideoPlayerAsset } from "@/components/limeplay/video-player/player";
import { TelevisionPlayer } from "@/components/tv";
import type { PlaybackSource } from "@/hooks/limeplay/use-asset";
import { usePlaylistStore } from "@/hooks/limeplay/use-playlist";

type ResolveCandidate = {
  type: "hls" | "mp4";
  quality: string;
  codec?: string;
  proxyUrl: string;
};

type ResolveResponse = {
  episodeId?: number;
  candidates: ResolveCandidate[];
  episode?: { id: number; label?: string; name?: string };
  notes?: string[];
  error?: string;
};

/**
 * Resolve a One Pace episode into a Shaka-compatible playback source.
 *
 * The resolver is lazy: it only fires when the asset is actually being
 * loaded, so the full 518-episode queue does not hammer the upstream
 * resolver at page load time.
 */
function resolveEpisodeSource(
  asset: VideoPlayerAsset,
  signal?: AbortSignal
): Promise<PlaybackSource | null> {
  const episodeId = asset.episodeId;
  if (!episodeId) return Promise.resolve(null);

  return fetch(`/api/resolve?id=${episodeId}`, { signal })
    .then((res) => res.json() as Promise<ResolveResponse>)
    .then((data) => {
      if (data.error || !data.candidates?.length) return null;

      // Prefer HLS (Shaka handles it natively), fall back to MP4.
      const hls = data.candidates.find((c) => c.type === "hls");
      const mp4 = data.candidates.find((c) => c.type === "mp4");
      const chosen = hls ?? mp4;
      if (!chosen) return null;

      // Shaka Player has sensible defaults; we only need the URL here.
      return { src: chosen.proxyUrl };
    })
    .catch((error: unknown) => {
      // An aborted resolve is not a failure, the request was replaced by a
      // newer one or the player was torn down.
      if (signal?.aborted) return null;
      throw error;
    });
}

/**
 * Keeps the address bar in sync with the episode that is playing.
 *
 * The player walks through the queue on its own, so the url of the page
 * would still point at the episode the page was opened with. A reload would
 * then start the first episode again instead of the one that was watched.
 */
function EpisodeUrlSync() {
  const episodeId = usePlaylistStore(
    (state) => state.currentItem?.properties?.episodeId as number | undefined
  );

  useEffect(() => {
    if (!episodeId) return;

    const path = `/watch/${episodeId}`;
    if (window.location.pathname === path) return;

    // The native history api updates the address bar without a navigation,
    // so the player keeps the episode it is playing.
    window.history.replaceState(null, "", path);
  }, [episodeId]);

  return null;
}

export interface WatchClientProps {
  assets: VideoPlayerAsset[];
  initialIndex: number;
}

export function WatchClient({ assets, initialIndex }: WatchClientProps) {
  const resolveSource = useCallback(
    (context: {
      asset: VideoPlayerAsset;
      previousError?: unknown;
      retryCount: number;
      signal: AbortSignal;
      startTime?: number;
    }) => {
      // Honour the abort signal so stale resolves don't load into the player.
      if (context.signal.aborted) return Promise.resolve(null);
      return resolveEpisodeSource(context.asset, context.signal);
    },
    []
  );

  if (assets.length === 0) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="p-6 text-white/60">No episodes available.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 p-4 flex items-center gap-4">
        <Link href="/" className="text-white/60 hover:text-white">
          ← Back
        </Link>
        <div className="text-sm text-white/50">
          Episode {initialIndex + 1} / {assets.length}
        </div>
      </header>

      <div className="w-full">
        <TelevisionPlayer
          source={assets}
          initialIndex={initialIndex}
          loading={{
            resolveSource,
            autoplayFirst: true,
            maxRetries: 2,
          }}
          mediaProps={{ autoPlay: true }}
          frame={{
            align: "center",
            className:
              "[--tv-room-min-height:calc(100svh_-_5rem)] max-[700px]:[--tv-room-min-height:340px]",
          }}
        >
          <EpisodeUrlSync />
        </TelevisionPlayer>
      </div>
    </main>
  );
}