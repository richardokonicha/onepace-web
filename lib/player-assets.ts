import type { Arc, Episode } from "./types";
import type { VideoPlayerAsset } from "@/components/limeplay/video-player/player";
import { getLibrary } from "./library";

/**
 * Map the One Pace library (arcs + episodes) into Limeplay
 * `VideoPlayerAsset[]` items, ordered by arc then episode.
 *
 * Each asset carries only metadata — the stream URL is resolved lazily
 * through `resolveSource`, so the full 518-episode queue is cheap to build.
 */
export function buildPlayerAssets(arcs: Arc[]): VideoPlayerAsset[] {
  const assets: VideoPlayerAsset[] = [];

  for (const arc of arcs) {
    for (const episode of arc.episodes) {
      assets.push(buildAsset(arc, episode));
    }
  }

  return assets;
}

export function buildAsset(arc: Arc, episode: Episode): VideoPlayerAsset {
  const arcLabel = arc.label?.trim() || `Arc ${arc.season}`;
  const title = episode.name?.trim() || `Episode ${episode.episode}`;

  return {
    id: `ep-${episode.id}`,
    episodeId: episode.id,
    arc: arcLabel,
    episode: episode.episode,
    title,
    description: episode.overview?.trim() || undefined,
    poster: episode.still || undefined,
    year: episode.air_date ? episode.air_date.slice(0, 4) : undefined,
  };
}

/** Resolve the full series library and build the ordered asset queue. */
export async function getSeriesAssets(series = 98): Promise<VideoPlayerAsset[]> {
  const { arcs } = await getLibrary(series);
  return buildPlayerAssets(arcs);
}

/** Find the index of an episode id inside an ordered asset queue. */
export function findAssetIndex(assets: VideoPlayerAsset[], episodeId: number): number {
  return assets.findIndex((a) => a.episodeId === episodeId);
}