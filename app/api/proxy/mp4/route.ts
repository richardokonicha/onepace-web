import { NextRequest, NextResponse } from "next/server";
import { verifyPayload } from "@/lib/proxy";
import { resolveSession } from "@/lib/resolver";
import { errorMessage } from "@/lib/onepace";

export const runtime = "nodejs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const WORKER = "https://young-dust-31f3.reimoto.workers.dev/?url=";

async function tryFetch(upstream: string, range: string | null) {
  const headers: Record<string, string> = { "User-Agent": UA, Referer: "https://onepace.co/" };
  if (range) headers["Range"] = range;
  try {
    const res = await fetch(upstream, { headers, cache: "no-store", redirect: "follow" });
    if (res.status === 200 || res.status === 206) return res;
    await res.body?.cancel();
  } catch {}
  try {
    const res = await fetch(WORKER + encodeURIComponent(upstream), {
      headers: range ? { Range: range, "User-Agent": UA } : { "User-Agent": UA },
      cache: "no-store",
      redirect: "follow",
    });
    if (res.status === 200 || res.status === 206) return res;
    await res.body?.cancel();
  } catch {}
  return null;
}

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  if (!t) return NextResponse.json({ error: "missing t" }, { status: 400 });
  const payload = verifyPayload(t);
  if (!payload) return NextResponse.json({ error: "invalid or expired" }, { status: 403 });
  if (payload.kind !== "mp4") return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const range = req.headers.get("range");
  const seriesId = 98;

  const attempt = async (force: boolean) => {
    const session = await resolveSession(payload.ep, seriesId, force);
    const upstream = session.mp4[payload.q];
    if (!upstream) return null;
    const res = await tryFetch(upstream, range);
    return res ? { res, session } : null;
  };

  let hit: Awaited<ReturnType<typeof attempt>> = null;
  try {
    hit = await attempt(false);
    if (!hit) hit = await attempt(true);
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
  if (!hit) return NextResponse.json({ error: "stream unavailable" }, { status: 502 });

  const res = hit.res;
  const respHeaders = new Headers();
  respHeaders.set("Access-Control-Allow-Origin", "*");
  respHeaders.set("Accept-Ranges", "bytes");
  respHeaders.set("Cache-Control", "no-cache");
  const ct = res.headers.get("content-type");
  if (ct) respHeaders.set("Content-Type", ct);
  const cl = res.headers.get("content-length");
  if (cl) respHeaders.set("Content-Length", cl);
  const cr = res.headers.get("content-range");
  if (cr) respHeaders.set("Content-Range", cr);

  return new NextResponse(res.body, { status: res.status, headers: respHeaders });
}
