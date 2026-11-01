import { errorMessage, fetchOnepaceJson } from "./onepace";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SITE = "https://onepace.co";
const WORKER = "https://young-dust-31f3.reimoto.workers.dev/?url=";

export type HlsSession = {
  masterUrl: string;
  variants: string[];
};

export type StreamSession = {
  episodeId: number;
  seriesId: number;
  resolvedAt: number;
  hls: HlsSession | null;
  mp4: Record<string, string>;
  notes: string[];
};

type WatchSource = { server: string; quality: string; language: string; embed: string };
type WatchResp = { gated: boolean; sources: WatchSource[] };

const g = globalThis as unknown as {
  __onepaceWatch?: Map<string, { data: WatchResp; ts: number }>;
  __onepaceSessions?: Map<string, StreamSession>;
};

const watchCache: Map<string, { data: WatchResp; ts: number }> = (g.__onepaceWatch ??= new Map());
const sessions: Map<string, StreamSession> = (g.__onepaceSessions ??= new Map());

const WATCH_TTL = 10 * 60 * 1000;
const SESSION_TTL = 10 * 60 * 1000;

export async function getWatchSources(postId: number, episodeId: number, force = false): Promise<WatchResp> {
  const key = `${postId}:${episodeId}`;
  const hit = watchCache.get(key);
  if (!force && hit && Date.now() - hit.ts < WATCH_TTL) return hit.data;
  const data = await fetchOnepaceJson<WatchResp>("/wp-json/dgt/v1/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: postId, episode_id: episodeId }),
  });
  watchCache.set(key, { data, ts: Date.now() });
  return data;
}

async function fetchText(url: string, referer = `${SITE}/`) {
  const res = await timedFetch(url, { headers: { "User-Agent": UA, Referer: referer } });
  if (!res.ok) throw new Error(`fetchText ${res.status}`);
  return res.text();
}

async function fetchViaWorker(url: string, referer = `${SITE}/`) {
  const res = await timedFetch(WORKER + encodeURIComponent(url), {
    headers: { "User-Agent": UA, Referer: referer },
  });
  if (!res.ok) throw new Error(`worker ${res.status}`);
  return res.text();
}

async function timedFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 12000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, cache: "no-store", redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function probeRange(url: string): Promise<boolean> {
  try {
    const res = await timedFetch(url, {
      headers: { "User-Agent": UA, Referer: `${SITE}/`, Range: "bytes=0-1023" },
      timeoutMs: 12000,
    });
    if (res.status === 200 || res.status === 206) {
      await res.body?.cancel();
      return true;
    }
  } catch {}
  try {
    const res = await timedFetch(WORKER + encodeURIComponent(url), {
      headers: { "User-Agent": UA, Range: "bytes=0-1023" },
      timeoutMs: 12000,
    });
    if (res.status === 200 || res.status === 206) {
      await res.body?.cancel();
      return true;
    }
  } catch {}
  return false;
}

function hostVariants(master: string) {
  const u = new URL(master);
  const out = [master];
  const srv = u.searchParams.get("srv");
  if (srv) {
    out.push(master.replace(u.origin, `https://${srv}.vmeas.cloud`));
    out.push(master.replace(u.origin, "https://gate-2-an-p.vmnow.online"));
  }
  return out;
}

async function resolveHls(embed: string, notes: string[]): Promise<HlsSession | null> {
  const deadline = Date.now() + 35000;
  let upstream: string | null = null;
  try {
    const page = await fetchText(embed, `${SITE}/`);
    const iframe = page.match(/<iframe[^>]+src="([^"]+)"/);
    if (!iframe) {
      notes.push("vidmoly: no iframe");
      return null;
    }
    upstream = decodeURIComponent(iframe[1]);
  } catch (e: unknown) {
    notes.push(`vidmoly embed: ${errorMessage(e)}`);
    return null;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    if (Date.now() > deadline) break;
    let vpage = "";
    try {
      vpage = await fetchText(upstream!, embed);
    } catch {
      try {
        vpage = await fetchViaWorker(upstream!, embed);
      } catch (inner: unknown) {
        notes.push(`vidmoly page: ${errorMessage(inner)}`);
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
    }
    const masters = vpage.match(/https:\/\/[^"']+master\.m3u8[^"']*/g) || [];
    for (const m of masters) {
      for (const cand of hostVariants(m)) {
        if (Date.now() > deadline) break;
        let text = "";
        try {
          text = await fetchText(cand, `${SITE}/`);
        } catch {
          try {
            text = await fetchViaWorker(cand, `${SITE}/`);
          } catch {
            continue;
          }
        }
        if (!text.includes("#EXTM3U")) continue;
        const variants = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"))
          .map((l) => new URL(l, cand).href);
        if (variants.length === 0) continue;
        return { masterUrl: cand, variants };
      }
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 200));
  }
  notes.push("vidmoly: no working master");
  return null;
}

async function resolveNeo(embed: string, notes: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let page = "";
  try {
    page = await fetchText(embed, `${SITE}/`);
  } catch (e: unknown) {
    notes.push(`neocdn page: ${errorMessage(e)}`);
    return out;
  }
  const m = page.match(/fetch\("([^"]+)"\)/);
  if (!m) {
    notes.push("neocdn: no fetch url");
    return out;
  }
  const fetchUrl = m[1].startsWith("http") ? m[1] : `${SITE}${m[1]}`;
  let payload: { sources?: Array<{ type: string; url: string; size: string }> };
  try {
    payload = await fetchOnepaceJson(fetchUrl.replace(SITE, ""), { headers: { Referer: embed } });
  } catch (e: unknown) {
    notes.push(`neocdn payload: ${errorMessage(e)}`);
    return out;
  }
  const entries = (payload.sources || []).filter((s) => s.url);
  const probed = await Promise.all(
    entries.map(async (s) => ({ type: s.type, url: s.url, alive: await probeRange(s.url) }))
  );
  for (const p of probed) if (p.alive) out[p.type] = p.url;
  // If nothing probed alive but we have sources, be lenient and try them
  if (Object.keys(out).length === 0 && entries.length > 0) {
    for (const s of entries.slice(0, 3)) {
      if (s.url) out[s.type] = s.url;
    }
  }
  if (Object.keys(out).length === 0) notes.push("neocdn: no working rendition");
  return out;
}


async function resolveVidStream(embed: string, notes: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const page = await fetchText(embed, `${SITE}/`);
    const iframe = page.match(/<iframe[^>]+src="([^"]+)"/);
    if (!iframe) { notes.push("vidstream: no iframe"); return out; }
    let src = decodeURIComponent(iframe[1]);
    // Follow redirects
    try {
      const res = await timedFetch(src, { headers: { "User-Agent": UA, Referer: embed }, timeoutMs: 15000 });
      src = res.url || src;
      const text = await res.text();
      // Look for m3u8
      const m3u8s = text.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g);
      if (m3u8s && m3u8s[0]) {
        // probe
        if (await probeRange(m3u8s[0])) out["720p"] = m3u8s[0];
      }
    } catch (e: unknown) {
      notes.push(`vidstream: ${errorMessage(e)}`);
    }
  } catch (e: unknown) {
    notes.push(`vidstream: ${errorMessage(e)}`);
  }
  return out;
}

async function resolveHydraX(embed: string, notes: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const page = await fetchText(embed, `${SITE}/`);
    const iframe = page.match(/<iframe[^>]+src="([^"]+)"/);
    if (!iframe) { notes.push("hydrax: no iframe"); return out; }
    const src = decodeURIComponent(iframe[1]);
    // Try to extract from page
    try {
      const vpage = await fetchText(src, embed);
      const m3u8s = vpage.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g);
      if (m3u8s) {
        for (const m of m3u8s.slice(0, 3)) {
          if (await probeRange(m)) { out["720p"] = m; break; }
        }
      }
    } catch (e: unknown) {
      notes.push(`hydrax: ${errorMessage(e)}`);
    }
  } catch (e: unknown) {
    notes.push(`hydrax: ${errorMessage(e)}`);
  }
  return out;
}

async function resolveGenericMp4(embed: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const page = await fetchText(embed, `${SITE}/`);
    const iframe = page.match(/<iframe[^>]+src="([^"]+)"/);
    if (!iframe) return out;
    const src = decodeURIComponent(iframe[1]);
    try {
      const vpage = await fetchText(src, embed);
      const mp4s = vpage.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g);
      if (mp4s) {
        for (const m of mp4s.slice(0, 5)) {
          if (await probeRange(m)) { out["720p"] = m; break; }
        }
      }
    } catch {}
  } catch {}
  return out;
}

const RESOLVE_DEADLINE_MS = 20000;

export async function resolveSession(episodeId: number, seriesId: number, force = false): Promise<StreamSession> {
  const key = `${seriesId}:${episodeId}`;
  const hit = sessions.get(key);
  if (!force && hit && Date.now() - hit.resolvedAt < SESSION_TTL) return hit;

  const notes: string[] = [];
  const watch = await getWatchSources(seriesId, episodeId, force);
  const session: StreamSession = { episodeId, seriesId, resolvedAt: Date.now(), hls: null, mp4: {}, notes };

  const vidmoly = watch.sources.find((s) => s.server === "Vidmoly");
  const neo = watch.sources.find((s) => s.server === "NeoCDN");
  const vidstream = watch.sources.find((s) => s.server === "VidStream");
  const hydrax = watch.sources.find((s) => s.server === "HydraX");
  const mirror = watch.sources.find((s) => s.server === "MirrorBot");
  const sruby = watch.sources.find((s) => s.server === "SRuby");
  const omega = watch.sources.find((s) => s.server === "Omega");
  const vidcloud = watch.sources.find((s) => s.server === "Vidcloud");
  const pixel = watch.sources.find((s) => s.server.startsWith("Pixel"));
  const vidsrc = watch.sources.find((s) => s.server.startsWith("VidSrc"));

  const hasSource = () => session.hls !== null || Object.keys(session.mp4).length > 0;

  const primary = async (): Promise<void> => {
    const tasks: Array<() => Promise<void>> = [];
    if (vidmoly) {
      tasks.push(async () => {
        try {
          const v = await resolveHls(vidmoly.embed, notes);
          if (v) session.hls = v;
        } catch (e: unknown) { notes.push(`vidmoly: ${errorMessage(e)}`); }
      });
    }
    if (neo) {
      tasks.push(async () => {
        try {
          const v = await resolveNeo(neo.embed, notes);
          session.mp4 = { ...session.mp4, ...v };
        } catch (e: unknown) { notes.push(`neocdn: ${errorMessage(e)}`); }
      });
    }
    await Promise.all(tasks.map(t=>t()));
  };

  const secondary = async (): Promise<void> => {
    const tasks: Array<() => Promise<void>> = [];
    if (vidstream && !hasSource()) {
      tasks.push(async () => {
        try {
          const v = await resolveVidStream(vidstream.embed, notes);
          if (Object.keys(v).length > 0) session.mp4 = { ...session.mp4, ...v };
        } catch (e: unknown) { notes.push(`vidstream: ${errorMessage(e)}`); }
      });
    } else if (vidstream) {
      tasks.push(async () => {
        try {
          const v = await resolveVidStream(vidstream.embed, notes);
          if (Object.keys(v).length > 0 && Object.keys(session.mp4).length === 0) session.mp4 = { ...session.mp4, ...v };
        } catch {}
      });
    }
    if (hydrax) {
      tasks.push(async () => {
        try {
          const v = await resolveHydraX(hydrax.embed, notes);
          if (Object.keys(v).length > 0 && !hasSource()) session.mp4 = { ...session.mp4, ...v };
          else if (Object.keys(v).length > 0 && Object.keys(session.mp4).length === 0) session.mp4 = { ...session.mp4, ...v };
        } catch (e: unknown) { notes.push(`hydrax: ${errorMessage(e)}`); }
      });
    }
    for (const [name, src] of [['mirror', mirror], ['sruby', sruby], ['omega', omega], ['vidcloud', vidcloud], ['pixel', pixel], ['vidsrc', vidsrc]] as const) {
      if (src) {
        tasks.push(async () => {
          try {
            const v = await resolveGenericMp4((src as any).embed);
            if (Object.keys(v).length > 0 && Object.keys(session.mp4).length === 0) session.mp4 = { ...session.mp4, ...v };
          } catch (e: unknown) { notes.push(`${name}: ${errorMessage(e)}`); }
        });
      }
    }
    await Promise.all(tasks.map(t=>t()));
  };

  await Promise.race([
    primary().then(() => secondary()),
    new Promise((resolve) => setTimeout(resolve, RESOLVE_DEADLINE_MS)),
  ]);

  if (!hasSource()) {
    notes.push("resolve: no working source");
    session.resolvedAt = Date.now() - SESSION_TTL + 20000;
  }

  sessions.set(key, session);
  return session;
}

export function getSessionSync(episodeId: number, seriesId: number) {
  return sessions.get(`${seriesId}:${episodeId}`) || null;
}
