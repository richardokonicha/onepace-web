import { createHmac } from "crypto";

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
  | { kind: "mp4"; ep: number; q: string }
  | { kind: "hls-master"; ep: number }
  | { kind: "hls-seg"; ep: number; path: string; fallback?: string }
  | { kind: "url"; u: string };

export function signPayload(payload: ProxyPayload, ttlSec = 30 * 24 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPayload(t: string): ProxyPayload | null {
  try {
    const [body, sig] = t.split(".");
    if (!body || !sig) return null;
    const expect = createHmac("sha256", SECRET).update(body).digest("base64url");
    if (expect.length !== sig.length) return null;
    if (!timingSafeEqual(expect, sig)) return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof data.u === "string") {
      if (!isAllowed(data.u)) return null;
      return { kind: "url", u: data.u };
    }
    if (typeof data.ep !== "number") return null;
    if (data.kind === "mp4" && typeof data.q === "string") return { kind: "mp4", ep: data.ep, q: data.q };
    if (data.kind === "hls-master") return { kind: "hls-master", ep: data.ep };
    if (data.kind === "hls-seg" && typeof data.path === "string") {
      return { kind: "hls-seg", ep: data.ep, path: data.path, fallback: data.fallback };
    }
    return null;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
