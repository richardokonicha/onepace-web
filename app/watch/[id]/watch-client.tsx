"use client";

import { useCallback } from "react";
import Link from "next/link";

import type { VideoPlayerAsset } from "@/components/limeplay/video-player/player";
import { VideoPlayer } from "@/components/limeplay/video-player/player";
import type { PlaybackSource } from "@/hooks/limeplay/use-asset";

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
  asset: VideoPlayerAsset
): Promise<PlaybackSource | null> {
  const episodeId = asset.episodeId;
  if (!episodeId) return Promise.resolve(null);

  return fetch(`/api/resolve?id=${episodeId}`)
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
    });
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
      return resolveEpisodeSource(context.asset);
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

      <div className="mx-auto w-full max-w-7xl p-4">
        <VideoPlayer
          source={assets}
          initialIndex={initialIndex}
          loading={{
            resolveSource,
            autoplayFirst: true,
            maxRetries: 2,
          }}
          mediaProps={{ autoPlay: true }}
          layout="aspect"
        />
      </div>
    </main>
  );
}