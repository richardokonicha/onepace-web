import { signPayload } from "./proxy";
import type { HlsCandidate } from "./resolver";

export type PlaybackCandidate = {
  type: "hls" | "mp4";
  quality: string;
  codec: string;
  server?: string;
  proxyUrl: string;
};

const MP4_QUALITY_ORDER = ["720p", "480p", "360p", "1080p"];

export function mp4Codec(quality: string): string {
  return quality === "1080p" ? "av1" : "h264";
}

/** Build a proxied HLS candidate for a discovered playlist URL. */
export async function hlsCandidate(ep: number, extra: HlsCandidate): Promise<PlaybackCandidate> {
  const kind = extra.kind === "master" ? "hls-master" : "hls-playlist";
  const path = extra.kind === "master" ? "/api/proxy/hls" : "/api/proxy/hls/playlist";
  const token = await signPayload({ ep, kind, u: extra.url });
  return {
    type: "hls",
    quality: "720p",
    codec: "h264",
    server: extra.server,
    proxyUrl: `${path}?t=${token}`,
  };
}

/** Build proxied MP4 candidates in preferred quality order. */
export async function mp4Candidates(
  ep: number,
  mp4: Record<string, string>
): Promise<PlaybackCandidate[]> {
  const qualities = [
    ...MP4_QUALITY_ORDER.filter((q) => mp4[q]),
    ...Object.keys(mp4).filter((q) => !MP4_QUALITY_ORDER.includes(q)),
  ];
  const out: PlaybackCandidate[] = [];
  for (const q of qualities) {
    const token = await signPayload({ ep, kind: "mp4", q, u: mp4[q] });
    out.push({
      type: "mp4",
      quality: q,
      codec: mp4Codec(q),
      proxyUrl: `/api/proxy/mp4?t=${token}`,
    });
  }
  return out;
}
