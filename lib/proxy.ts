const SECRET = process.env.PROXY_SECRET || "onepace-proxy-dev";

const allowlist = [
  /\.trycloudflare\.com$/,
  /\.vmeas\.cloud$/,
  /\.vmpx\.online$/,
  /\.vmnow\.online$/,
  /^onepace\.co$/,
];

export function isAllowed(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return allowlist.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export type ProxyPayload =
  | { kind: "mp4"; ep: number; q: string; u?: string }
  | { kind: "hls-master"; ep: number; u?: string }
  | { kind: "hls-playlist"; ep: number; u: string }
  | { kind: "hls-seg"; ep: number; u: string }
  | { kind: "url"; u: string };

function toBase64Url(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/**
 * Expiry used for a signed payload.
 *
 * The upstream playback URLs carry their own `s` (issued at) and `e`
 * (lifetime in seconds) parameters, so the same upstream URL always maps to
 * the same expiry. Deriving it from the URL instead of the clock makes the
 * token a pure function of its payload, which keeps the CDN key stable: the
 * server-side warm-up and the browser then request the very same URL and
 * share one cache entry.
 *
 * Payloads without upstream timing fall back to a bucketed clock, so an
 * identical payload still yields an identical token inside the bucket.
 */
function payloadExpiry(payload: ProxyPayload, ttlSec: number): number {
  const u = "u" in payload ? payload.u : undefined;
  const now = Math.floor(Date.now() / 1000);
  if (u) {
    try {
      const params = new URL(u).searchParams;
      const issuedAt = Number(params.get("s"));
      const lifetime = Number(params.get("e"));
      if (Number.isFinite(issuedAt) && Number.isFinite(lifetime) && issuedAt > 1e9 && lifetime > 0) {
        const upstreamExp = issuedAt + lifetime;
        // Only trust the upstream expiry when it still has room to run, so a
        // stale upstream token cannot shorten the proxy token below the
        // fallback lifetime.
        if (upstreamExp > now + 300) return upstreamExp;
      }
    } catch {
      // Not a URL with upstream timing, fall through to the clock.
    }
  }
  return Math.floor((now + ttlSec) / 300) * 300;
}

export async function signPayload(payload: ProxyPayload, ttlSec = 6 * 3600) {
  const exp = payloadExpiry(payload, ttlSec);
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify({ ...payload, exp })));
  const key = await hmacKey();
  const sig = toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))));
  return `${body}.${sig}`;
}

export async function verifyPayload(t: string): Promise<ProxyPayload | null> {
  try {
    const dot = t.lastIndexOf(".");
    if (dot <= 0) return null;
    const body = t.slice(0, dot);
    const sig = t.slice(dot + 1);
    if (!body || !sig) return null;
    const key = await hmacKey();
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    const got = fromBase64Url(sig);
    if (expected.length !== got.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ got[i];
    if (diff !== 0) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof data.u === "string") {
      if (!isAllowed(data.u)) return null;
      if (data.kind === "hls-seg" && typeof data.ep === "number") {
        return { kind: "hls-seg", ep: data.ep, u: data.u };
      }
      if (data.kind === "hls-playlist" && typeof data.ep === "number") {
        return { kind: "hls-playlist", ep: data.ep, u: data.u };
      }
      if (data.kind === "hls-master" && typeof data.ep === "number") {
        return { kind: "hls-master", ep: data.ep, u: data.u };
      }
      if (data.kind === "mp4" && typeof data.ep === "number" && typeof data.q === "string") {
        return { kind: "mp4", ep: data.ep, q: data.q, u: data.u };
      }
      return { kind: "url", u: data.u };
    }
    if (typeof data.ep !== "number") return null;
    if (data.kind === "mp4" && typeof data.q === "string") return { kind: "mp4", ep: data.ep, q: data.q };
    if (data.kind === "hls-master") return { kind: "hls-master", ep: data.ep };
    return null;
  } catch {
    return null;
  }
}
