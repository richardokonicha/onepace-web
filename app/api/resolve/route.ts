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
    if (!ep) return NextResponse.json({ error: "not found" }, { status: 404 });

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
    if (candidates.length > 0) cache.set(key, { data, ts: Date.now(), masterPath });
    return NextResponse.json(data, { headers: cacheHeaders(true) });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
