import { fetchOnepaceJson } from "./onepace";
import type { Episode, Arc } from "./types";

interface EpisodesResp {
  series_id: number;
  season: number | null;
  episodes: Episode[];
}

let cache: { episodes: Episode[]; arcs: Arc[]; ts: number } | null = null;
const TTL = 60 * 60 * 1000;

export async function getLibrary(series = 98) {
  if (cache && Date.now() - cache.ts < TTL) {
    return { episodes: cache.episodes, arcs: cache.arcs };
  }
  const data = await fetchOnepaceJson<EpisodesResp>(`/wp-json/dgt/v1/episodes?series=${series}`);
  const episodes = [...data.episodes].sort((a, b) => a.season - b.season || a.episode - b.episode).map((e, i) => ({ ...e, globalIndex: i + 1 }));
  const arcMap = new Map<number, Arc>();
  for (const e of episodes) {
    if (!arcMap.has(e.season)) arcMap.set(e.season, { season: e.season, label: e.label.replace(/ E\d+.*$/, "").trim() || `Arc ${e.season}`, episodes: [] });
    arcMap.get(e.season)!.episodes.push(e);
  }
  const arcs = Array.from(arcMap.values()).sort((a, b) => a.season - b.season);
  cache = { episodes, arcs, ts: Date.now() };
  return { episodes, arcs };
}

export async function getEpisode(id: number, series = 98) {
  const { episodes } = await getLibrary(series);
  return episodes.find((e) => e.id === id) || null;
}
