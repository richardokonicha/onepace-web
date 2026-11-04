import { NextRequest, NextResponse } from "next/server";
import { verifyPayload } from "@/lib/proxy";
import { resolveSession } from "@/lib/resolver";
import { errorMessage } from "@/lib/onepace";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const WORKER = "https://young-dust-31f3.reimoto.workers.dev/?url=";
const UPSTREAM_TIMEOUT_MS = 15000;

async function tryFetch(upstream: string, range: string | null) {
  const headers: Record<string, string> = { "User-Agent": UA, Referer: "https://onepace.co/" };
  if (range) headers["Range"] = range;
  try {
    const res = await fetchWithTimeout(upstream, headers, UPSTREAM_TIMEOUT_MS);
    if (res.status === 200 || res.status === 206) return res;
    await res.body?.cancel();
  } catch {}
  try {
    const res = await fetchWithTimeout(
      WORKER + encodeURIComponent(upstream),
      range ? { Range: range, "User-Agent": UA } : { "User-Agent": UA },
      UPSTREAM_TIMEOUT_MS
    );
    if (res.status === 200 || res.status === 206) return res;
    await res.body?.cancel();
  } catch {}
  return null;
}

/**
 * Some upstreams (notably Cloudflare R2) answer a HEAD request without a
 * `Content-Length`, because the edge strips body headers on HEAD responses.
 * Shaka's MP4 parser needs the size to issue its first byte-range request,
 * so when a HEAD response is missing it we probe the total length with a
 * single-byte range GET and reuse that value.
 */
async function fetchContentLength(upstream: string): Promise<number | null> {
  const res = await tryFetch(upstream, "bytes=0-0");
  if (!res) return null;
  await res.body?.cancel();
  const cr = res.headers.get("content-range") || res.headers.get("Content-Range");
  if (cr) {
    const total = cr.split("/")[1];
    const n = Number(total);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const cl = res.headers.get("content-length") || res.headers.get("Content-Length");
  const n = Number(cl);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  if (!t) return NextResponse.json({ error: "missing t" }, { status: 400 });
  const payload = await verifyPayload(t);
  if (!payload) return NextResponse.json({ error: "invalid or expired" }, { status: 403 });
  if (payload.kind !== "mp4") return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const range = req.headers.get("range");
  const seriesId = 98;

  const upstreamCandidates: string[] = [];
  if (payload.u) upstreamCandidates.push(payload.u);

  if (upstreamCandidates.length === 0) {
    try {
      const session = await resolveSession(payload.ep, seriesId, true);
      const resolved = session.mp4[payload.q];
      if (resolved) upstreamCandidates.push(resolved);
    } catch (e: unknown) {
      return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
    }
  }

  // Shaka's MP4 parser probes the size with a HEAD request before issuing
  // byte-range GETs. Cloudflare R2 answers HEAD without a Content-Length
  // (the edge strips body headers on HEAD), so a bare pass-through leaves
  // Shaka with no size and it never streams. Probe the total length with a
  // single-byte range GET when the HEAD response is missing it.
  if (req.method === "HEAD") {
    let res: Response | null = null;
    for (const u of upstreamCandidates) {
      res = await tryFetch(u, null);
      if (res) break;
    }
    if (!res) return NextResponse.json({ error: "stream unavailable" }, { status: 502 });

    let total: number | null = null;
    const rawCl = res.headers.get("content-length") || res.headers.get("Content-Length");
    const rawCr = res.headers.get("content-range") || res.headers.get("Content-Range");
    if (rawCl) {
      const n = Number(rawCl);
      total = Number.isFinite(n) && n > 0 ? n : null;
    }
if (total === null && rawCr) {
      const m = rawCr.split("/")[1];
      const n = Number(m);
      total = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (total === null) {
      total = await fetchContentLength(upstreamCandidates[0]);
    }
    if (total === null) {
      await res.body?.cancel();
      return NextResponse.json({ error: "stream unavailable" }, { status: 502 });
    }

    const respHeaders = new Headers();
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Accept-Ranges", "bytes");
    respHeaders.set("Cache-Control", "no-cache");
    respHeaders.set("Content-Range", `bytes 0-0/${total}`);
    const ct = res.headers.get("content-type");
    if (ct) respHeaders.set("Content-Type", ct);
    await res.body?.cancel();
    // The Next.js edge runtime strips Content-Length from HEAD responses
    // regardless of the body, so carry the size in Content-Range instead.
    // Shaka's MP4 parser reads the size from either header.
    return new Response(new Uint8Array(0), {
      status: 200,
      headers: respHeaders,
    });
  }

  let res: Response | null = null;
  for (const u of upstreamCandidates) {
    res = await tryFetch(u, range);
    if (res) break;
  }
  if (!res && upstreamCandidates.length > 0) {
    // pinned URL failed, try re-resolving once more
    try {
      const session = await resolveSession(payload.ep, seriesId, true);
      const resolved = session.mp4[payload.q];
      if (resolved && !upstreamCandidates.includes(resolved)) {
        res = await tryFetch(resolved, range);
      }
    } catch {}
  }
  if (!res) return NextResponse.json({ error: "stream unavailable" }, { status: 502 });

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
