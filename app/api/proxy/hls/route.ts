import { NextRequest, NextResponse } from "next/server";
import { signPayload, verifyPayload } from "@/lib/proxy";
import { resolveSession } from "@/lib/resolver";
import { errorMessage } from "@/lib/onepace";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function fetchUpstream(url: string, referer = "https://onepace.co/") {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: referer },
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.text();
}

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  if (!t) return NextResponse.json({ error: "missing t" }, { status: 400 });
  const payload = await verifyPayload(t);
  if (!payload) return NextResponse.json({ error: "invalid or expired" }, { status: 403 });
  if (payload.kind !== "hls-master") return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const seriesId = 98;
  const origin = new URL(req.url).origin;

  let masterUrl = payload.u;
  let text = "";
  let session = await resolveSession(payload.ep, seriesId, false);

  if (masterUrl) {
    try {
      text = await fetchUpstream(masterUrl);
    } catch {
      masterUrl = undefined;
    }
  }

  if (!masterUrl || !text.includes("#EXTM3U")) {
    session = await resolveSession(payload.ep, seriesId, true);
    if (!session.hls) return NextResponse.json({ error: "hls unavailable" }, { status: 502 });
    masterUrl = session.hls.masterUrl;
    try {
      text = await fetchUpstream(masterUrl);
    } catch (e: unknown) {
      return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
    }
  }
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
      if (trimmed.includes("URI=\"")) {
        const matches = [...trimmed.matchAll(/URI="([^"]+)"/g)];
        const replacements: string[] = [];
        for (const m of matches) {
          const abs = new URL(m[1], masterUrl).href;
          const token = await signPayload({ kind: "hls-playlist", ep: payload.ep, u: abs });
          replacements.push(`URI="${origin}/api/proxy/hls/playlist?t=${token}"`);
        }
        let i = 0;
        out.push(trimmed.replace(/URI="[^"]+"/g, () => replacements[i++]));
      } else {
        out.push(line);
      }
      continue;
    }
    const abs = new URL(trimmed, masterUrl).href;
    const token = await signPayload({ kind: "hls-playlist", ep: payload.ep, u: abs });
    out.push(`${origin}/api/proxy/hls/playlist?t=${token}`);
  }

  return new NextResponse(out.join("\n") + "\n", {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    },
  });
}
