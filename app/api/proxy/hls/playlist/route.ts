import { NextRequest, NextResponse } from "next/server";
import { signPayload, verifyPayload } from "@/lib/proxy";
import { errorMessage } from "@/lib/onepace";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const UPSTREAM_TIMEOUT_MS = 12000;

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  if (!t) return NextResponse.json({ error: "missing t" }, { status: 400 });
  const payload = await verifyPayload(t);
  if (!payload) return NextResponse.json({ error: "invalid or expired" }, { status: 403 });
  if (payload.kind !== "hls-playlist") return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const origin = new URL(req.url).origin;
  let text = "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(payload.u, {
      headers: { "User-Agent": UA, Referer: "https://onepace.co/" },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    text = await res.text();
  } catch (e: unknown) {
    clearTimeout(timer);
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
  clearTimeout(timer);
  if (!text.includes("#EXTM3U")) return NextResponse.json({ error: "bad playlist" }, { status: 502 });

  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    if (trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const abs = new URL(trimmed, payload.u).href;
    const token = await signPayload({ kind: "hls-seg", ep: payload.ep, u: abs });
    out.push(`${origin}/api/proxy/hls/seg?t=${token}`);
  }

  return new NextResponse(out.join("\n") + "\n", {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      "Vercel-CDN-Cache-Control": "s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
