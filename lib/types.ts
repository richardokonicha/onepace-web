export type Episode = {
  id: number;
  series_id: number;
  season: number;
  special: boolean;
  episode: number;
  label: string;
  name: string;
  overview: string;
  air_date: string;
  still: string;
  url: string;
  globalIndex: number;
};

export type Arc = {
  season: number;
  label: string;
  episodes: Episode[];
};

export type NeoCDNSource = {
  type: string;
  url: string;
  size: string;
};

export type ResolvedStream = {
  type: "hls" | "mp4";
  quality: string;
  codec?: string;
  url: string;
  proxyUrl: string;
  referer?: string;
  episodeId: number;
};
