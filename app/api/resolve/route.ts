import { NextRequest, NextResponse, after } from "next/server";
import { getEpisodeLocal } from "@/lib/library";
import { resolveParallel } from "@/lib/resolver";
import { signPayload } from "@/lib/proxy";
import { hlsCandidate, mp4Candidates } from "@/lib/candidates";
import { cacheHeaders } from "@/lib/cache-headers";
import { warmHlsChain, warmOrigin } from "@/lib/warm";
import { errorMessage } from "@/lib/onepace";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const cache = new Map<string, { data: unknown; ts: number; masterPath?: string }>();
const TTL = 6 * 60 * 60 * 1000;
const MAX_CACHE = 200;

function setCache(key: string, value: { data: unknown; ts: number; masterPath?: string }) {
  if (cache.size >= MAX_CACHE) {
    // evict oldest
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache.entries()) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

const ANIWIXI_BUCKET = "https://pub-12c10152ae434eb9b0896f40f9986b3d.r2.dev";

/**
 * AniWixi publishes the later One Piece episodes (anime episode numbers
 * 1150-1180, which fall outside the One Pace library) as a single direct MP4
 * per episode on a Cloudflare R2 bucket. The URL is a pure function of the
 * anime episode number, so there is nothing to resolve - just probe it.
 *
 * The bucket serves the file with `Accept-Ranges: bytes` and a correct
 * `ftyp`/`moov` header, so Shaka plays it as a regular MP4 without needing
 * the HLS timestamp offset workaround that the One Pace streams require.
 */
async function resolveAniwixi(
  animeEpisode: number,
  req: NextRequest
): Promise<NextResponse> {
  const url = `${ANIWIXI_BUCKET}/OP/${animeEpisode}/${animeEpisode}.mp4`;
  let ok = false;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      redirect: "follow",
    });
    ok = res.ok && (res.headers.get("content-type") ?? "").includes("mp4");
  } catch {
    ok = false;
  }
  if (!ok) {
    return NextResponse.json(
      { error: "not found", episodeId: animeEpisode },
      { status: 404, headers: cacheHeaders(true) }
    );
  }

  const token = await signPayload({
    ep: animeEpisode,
    kind: "mp4",
    q: "720p",
    u: url,
  });
  const candidates = [
    {
      type: "mp4",
      quality: "720p",
      codec: "h264",
      server: "AniWixi",
      proxyUrl: `/api/proxy/mp4?t=${token}`,
    },
  ];

  const data = {
    episodeId: animeEpisode,
    candidates,
    episode: {
      id: animeEpisode,
      label: `Anime ${animeEpisode}`,
      name: `Episode ${animeEpisode}`,
    },
    notes: ["aniwixi: direct MP4 from Cloudflare R2"],
  };
  setCache(`ep:${animeEpisode}`, { data, ts: Date.now() });
  return NextResponse.json(data, { headers: cacheHeaders(true) });
}

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const key = `ep:${id}`;
  if (!fresh) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < TTL) {
      if (hit.masterPath) {
        const origin = warmOrigin(req);
        after(() => warmHlsChain(origin, hit.masterPath!));
      }
      return NextResponse.json(hit.data, { headers: cacheHeaders(true) });
    }
  }

  try {
    const ep = getEpisodeLocal(id);
    if (!ep) {
      return resolveAniwixi(id, req);
    }

    const session = await resolveParallel(ep.id, ep.series_id, fresh);
    const candidates: unknown[] = [];

    if (session.hls) {
      const token = await signPayload({ ep: ep.id, kind: "hls-master", u: session.hls.masterUrl });
      const masterPath = `/api/proxy/hls?t=${token}`;
      candidates.push({
        type: "hls",
        quality: "900p",
        codec: "h264",
        proxyUrl: masterPath,
      });
      // Warm the playlist and leading segments in the background so the
      // browser finds them in the CDN instead of fetching them cold.
      const origin = warmOrigin(req);
      after(() => warmHlsChain(origin, masterPath));
    }

    for (const extra of session.hlsExtra) {
      candidates.push(await hlsCandidate(ep.id, extra));
    }
    candidates.push(...(await mp4Candidates(ep.id, session.mp4)));

    const data = { episodeId: ep.id, candidates, episode: ep, notes: session.notes };
    let masterPath: string | undefined;
    if (session.hls && candidates.find((c: any) => c.type === "hls")) {
      // find the path we just built
      const hlsCand = candidates.find((c: any) => c.type === "hls") as any;
      masterPath = hlsCand?.proxyUrl;
    }
    if (candidates.length > 0) setCache(key, { data, ts: Date.now(), masterPath });
    return NextResponse.json(data, { headers: cacheHeaders(true) });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
