import { NextRequest, NextResponse } from "next/server";
import { getLibrary } from "@/lib/library";
import { resolveSession } from "@/lib/resolver";
import { signPayload } from "@/lib/proxy";
import { errorMessage } from "@/lib/onepace";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const key = `ep:${id}`;
  if (!fresh) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data);
  }

  try {
    const { episodes } = await getLibrary(98);
    const ep = episodes.find((e) => e.id === id);
    if (!ep) return NextResponse.json({ error: "not found" }, { status: 404 });

    const session = await resolveSession(ep.id, ep.series_id, fresh);
    const candidates: unknown[] = [];

    if (session.hls) {
      candidates.push({
        type: "hls",
        quality: "900p",
        codec: "h264",
        proxyUrl: `/api/proxy/hls?t=${await signPayload({ ep: ep.id, kind: "hls-master" })}`,
      });
    }

    const preferred = ["720p", "480p", "360p", "1080p"];
    const qualities = [...preferred.filter((q) => session.mp4[q]), ...Object.keys(session.mp4).filter((q) => !preferred.includes(q))];
    for (const q of qualities) {
      candidates.push({
        type: "mp4",
        quality: q,
        codec: q === "1080p" ? "av1" : "h264",
        proxyUrl: `/api/proxy/mp4?t=${await signPayload({ ep: ep.id, kind: "mp4", q })}`,
      });
    }

    const data = { episodeId: ep.id, candidates, episode: ep, notes: session.notes };
    if (candidates.length > 0) cache.set(key, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
