import { NextRequest, NextResponse } from "next/server";
import { getEpisodeLocal } from "@/lib/library";
import { resolveMp4Session } from "@/lib/resolver";
import { hlsCandidate, mp4Candidates } from "@/lib/candidates";
import { cacheHeaders } from "@/lib/cache-headers";
import { errorMessage } from "@/lib/onepace";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const key = `mp4:${id}`;
  if (!fresh) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < TTL) {
      return NextResponse.json(hit.data, { headers: cacheHeaders(fresh) });
    }
  }

  try {
    const ep = getEpisodeLocal(id);
    if (!ep) return NextResponse.json({ error: "not found" }, { status: 404 });

    const session = await resolveMp4Session(ep.id, ep.series_id, fresh);
    const candidates: unknown[] = [];

    for (const extra of session.hlsExtra) {
      candidates.push(await hlsCandidate(ep.id, extra));
    }
    candidates.push(...(await mp4Candidates(ep.id, session.mp4)));

    const data = { episodeId: ep.id, candidates, notes: session.notes };
    if (candidates.length > 0) cache.set(key, { data, ts: Date.now() });
    return NextResponse.json(data, { headers: cacheHeaders(fresh) });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
