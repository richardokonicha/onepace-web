import { fetchOnepaceJson } from "./onepace";
import type { Episode, Arc } from "./types";
import fallback from "./all98.json";

interface EpisodesResp {
  series_id: number;
  season: number | null;
  episodes: Episode[];
}

let cache: { episodes: Episode[]; arcs: Arc[]; ts: number } | null = null;
const TTL = 60 * 60 * 1000;

const localEpisodes = build((fallback as EpisodesResp).episodes).episodes;
const localIndex = new Map<number, Episode>(localEpisodes.map((e) => [e.id, e]));

export function getEpisodeLocal(id: number): Episode | null {
  return localIndex.get(id) ?? null;
}

function build(episodes: Episode[]) {
  const eps = [...episodes].sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.episode - b.episode).map((e, i) => ({ ...e, globalIndex: i + 1 }));
  const arcMap = new Map<number, Arc>();
  for (const e of eps) {
    if (!arcMap.has(e.season)) arcMap.set(e.season, { season: e.season, label: e.label?.replace(/ E\d+.*$/, "").trim() || `Arc ${e.season}`, episodes: [] });
    arcMap.get(e.season)!.episodes.push(e);
  }
  const arcs = Array.from(arcMap.values()).sort((a, b) => a.season - b.season);
  return { episodes: eps, arcs };
}

export async function getLibrary(series = 98) {
  if (cache && Date.now() - cache.ts < TTL) {
    return { episodes: cache.episodes, arcs: cache.arcs };
  }
  try {
    const data = await fetchOnepaceJson<EpisodesResp>(`/wp-json/dgt/v1/episodes?series=${series}`);
    if (data?.episodes?.length) {
      const result = build(data.episodes);
      cache = { ...result, ts: Date.now() };
      return result;
    }
  } catch {}
  // Fallback
  const data = fallback as EpisodesResp;
  const result = build(data.episodes);
  cache = { ...result, ts: Date.now() };
  return result;
}

export async function getEpisode(id: number, series = 98) {
  const { episodes } = await getLibrary(series);
  return episodes.find((e) => e.id === id) || null;
}
