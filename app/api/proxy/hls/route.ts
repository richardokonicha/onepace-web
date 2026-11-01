import { NextRequest, NextResponse } from "next/server";
import { signPayload, verifyPayload } from "@/lib/proxy";
import { resolveSession } from "@/lib/resolver";
import { errorMessage } from "@/lib/onepace";

export const runtime = "nodejs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://onepace.co/" },
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.text();
}

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  if (!t) return NextResponse.json({ error: "missing t" }, { status: 400 });
  const payload = verifyPayload(t);
  if (!payload) return NextResponse.json({ error: "invalid or expired" }, { status: 403 });
  if (payload.kind !== "hls-master") return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const seriesId = 98;
  let session = await resolveSession(payload.ep, seriesId, false);
  if (!session.hls) {
    session = await resolveSession(payload.ep, seriesId, true);
    if (!session.hls) return NextResponse.json({ error: "hls unavailable" }, { status: 502 });
  }
  const hls = session.hls;
  let text = "";
  try {
    text = await fetchText(hls.masterUrl);
  } catch {
    session = await resolveSession(payload.ep, seriesId, true);
    if (!session.hls) return NextResponse.json({ error: "hls unavailable" }, { status: 502 });
    try {
      text = await fetchText(session.hls.masterUrl);
    } catch (e: unknown) {
      return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
    }
  }
  if (!text.includes("#EXTM3U")) return NextResponse.json({ error: "bad playlist" }, { status: 502 });

  const origin = new URL(req.url).origin;
  const masterUrl = session.hls.masterUrl;
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("#EXT")) {
      if (line.includes("URI=\"")) {
        out.push(
          line.replace(/URI="([^"]+)"/g, (_, u) => {
            const abs = new URL(u, masterUrl).href;
            const path = new URL(abs).pathname;
            const token = signPayload({ ep: payload.ep, kind: "hls-seg", path, fallback: abs });
            return `URI="${origin}/api/proxy/hls/seg?t=${token}"`;
          })
        );
      } else {
        out.push(line);
      }
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      if (trimmed) out.push(line);
      continue;
    }
    const abs = new URL(trimmed, masterUrl).href;
    const path = new URL(abs).pathname;
    const token = signPayload({ ep: payload.ep, kind: "hls-seg", path, fallback: abs });
    out.push(`${origin}/api/proxy/hls/seg?t=${token}`);
  }

  return new NextResponse(out.join("\n") + "\n", {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    },
  });
}
