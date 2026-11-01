import { errorMessage, fetchOnepaceJson } from "./onepace";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SITE = "https://onepace.co";
const WORKER = "https://young-dust-31f3.reimoto.workers.dev/?url=";

const RESOLVE_TIMEOUT_MS = 6000;
const PROBE_TIMEOUT_MS = 5000;
const HLS_DEADLINE_MS = 12000;
const PARALLEL_DEADLINE_MS = 15000;

export type HlsSession = {
  masterUrl: string;
};

export type HlsCandidate = {
  url: string;
  kind: "master" | "media";
  server: string;
};

export type StreamSession = {
  episodeId: number;
  seriesId: number;
  resolvedAt: number;
  hls: HlsSession | null;
  mp4: Record<string, string>;
  hlsExtra: HlsCandidate[];
  notes: string[];
};

type WatchSource = { server: string; quality: string; language: string; embed: string };
type WatchResp = { gated: boolean; sources: WatchSource[] };

const g = globalThis as unknown as {
  __onepaceWatch?: Map<string, { data: WatchResp; ts: number }>;
  __onepaceWatchPending?: Map<string, Promise<WatchResp>>;
  __onepaceSessions?: Map<string, StreamSession>;
};

const watchCache: Map<string, { data: WatchResp; ts: number }> = (g.__onepaceWatch ??= new Map());
const watchPending: Map<string, Promise<WatchResp>> = (g.__onepaceWatchPending ??= new Map());
const sessions: Map<string, StreamSession> = (g.__onepaceSessions ??= new Map());

const WATCH_TTL = 10 * 60 * 1000;
const SESSION_TTL = 10 * 60 * 1000;

export async function getWatchSources(postId: number, episodeId: number, force = false): Promise<WatchResp> {
  const key = `${postId}:${episodeId}`;
  const hit = watchCache.get(key);
  if (!force && hit && Date.now() - hit.ts < WATCH_TTL) return hit.data;

  const pending = watchPending.get(key);
  if (pending) return pending;

  const request = fetchOnepaceJson<WatchResp>("/wp-json/dgt/v1/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: postId, episode_id: episodeId }),
  })
    .then((data) => {
      watchCache.set(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => {
      watchPending.delete(key);
    });

  watchPending.set(key, request);
  return request;
}

async function fetchText(url: string, referer = `${SITE}/`, timeoutMs = RESOLVE_TIMEOUT_MS) {
  const res = await timedFetch(url, { headers: { "User-Agent": UA, Referer: referer }, timeoutMs });
  if (!res.ok) throw new Error(`fetchText ${res.status}`);
  return res.text();
}

async function fetchViaWorker(url: string, referer = `${SITE}/`) {
  const res = await timedFetch(WORKER + encodeURIComponent(url), {
    headers: { "User-Agent": UA, Referer: referer },
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  if (!res.ok) throw new Error(`worker ${res.status}`);
  return res.text();
}

async function timedFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = RESOLVE_TIMEOUT_MS, ...rest } = init;
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
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    if (res.status === 200 || res.status === 206) {
      await res.body?.cancel();
      return true;
    }
  } catch {}
  try {
    const res = await timedFetch(WORKER + encodeURIComponent(url), {
      headers: { "User-Agent": UA, Range: "bytes=0-1023" },
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    if (res.status === 200 || res.status === 206) {
      await res.body?.cancel();
      return true;
    }
  } catch {}
  return false;
}

function isPlaylistUrl(url: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(url);
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

async function fetchPlaylist(url: string): Promise<string | null> {
  try {
    const text = await fetchText(url);
    return text.includes("#EXTM3U") ? text : null;
  } catch {}
  try {
    const text = await fetchViaWorker(url);
    return text.includes("#EXTM3U") ? text : null;
  } catch {}
  return null;
}

async function resolveHls(embed: string, notes: string[]): Promise<HlsSession | null> {
  const deadline = Date.now() + HLS_DEADLINE_MS;
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

  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() > deadline) break;
    let vpage = "";
    try {
      vpage = await fetchText(upstream!, embed);
    } catch {
      try {
        vpage = await fetchViaWorker(upstream!, embed);
      } catch (inner: unknown) {
        notes.push(`vidmoly page: ${errorMessage(inner)}`);
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
    }
    const masters = vpage.match(/https:\/\/[^"']+master\.m3u8[^"']*/g) || [];
    const primary = masters[0];
    if (primary) {
      // Probe the primary and its host variants together: the CDN often
      // rejects one host while a sibling serves the same token fine.
      const candidates = [primary, ...hostVariants(primary).slice(1), ...masters.slice(1)];
      const probed = await Promise.all(candidates.map((c) => fetchPlaylist(c)));
      const idx = probed.findIndex((t) => t !== null);
      if (idx >= 0) return { masterUrl: candidates[idx] };
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
  }
  notes.push("vidmoly: no working master");
  return null;
}

async function resolveNeo(embed: string, notes: string[]): Promise<{ mp4: Record<string, string>; hls: HlsCandidate[] }> {
  const mp4: Record<string, string> = {};
  const hls: HlsCandidate[] = [];
  let page = "";
  try {
    page = await fetchText(embed, `${SITE}/`);
  } catch (e: unknown) {
    notes.push(`neocdn page: ${errorMessage(e)}`);
    return { mp4, hls };
  }
  const m = page.match(/fetch\("([^"]+)"\)/);
  if (!m) {
    notes.push("neocdn: no fetch url");
    return { mp4, hls };
  }
  const fetchUrl = m[1].startsWith("http") ? m[1] : `${SITE}${m[1]}`;
  let payload: { sources?: Array<{ type: string; url: string; size: string }> };
  try {
    payload = await fetchOnepaceJson(fetchUrl.replace(SITE, ""), { headers: { Referer: embed } });
  } catch (e: unknown) {
    notes.push(`neocdn payload: ${errorMessage(e)}`);
    return { mp4, hls };
  }
  const entries = (payload.sources || []).filter((s) => s.url);
  const probed = await Promise.all(
    entries.map(async (s) => ({ type: s.type, url: s.url, alive: await probeRange(s.url) }))
  );
  for (const p of probed) {
    if (!p.alive) continue;
    if (isPlaylistUrl(p.url)) {
      hls.push({ url: p.url, kind: "master", server: "NeoCDN" });
    } else {
      mp4[p.type] = p.url;
    }
  }
  if (Object.keys(mp4).length === 0 && hls.length === 0 && entries.length > 0) {
    for (const s of entries.slice(0, 3)) {
      if (isPlaylistUrl(s.url)) {
        hls.push({ url: s.url, kind: "master", server: "NeoCDN" });
      } else {
        mp4[s.type] = s.url;
      }
    }
  }
  if (Object.keys(mp4).length === 0 && hls.length === 0) notes.push("neocdn: no working rendition");
  return { mp4, hls };
}

async function resolveVidStream(embed: string, notes: string[]): Promise<string[]> {
  const out: string[] = [];
  try {
    const page = await fetchText(embed, `${SITE}/`);
    const iframe = page.match(/<iframe[^>]+src="([^"]+)"/);
    if (!iframe) {
      notes.push("vidstream: no iframe");
      return out;
    }
    let src = decodeURIComponent(iframe[1]);
    const res = await timedFetch(src, { headers: { "User-Agent": UA, Referer: embed }, timeoutMs: RESOLVE_TIMEOUT_MS });
    src = res.url || src;
    const text = await res.text();
    const m3u8s = text.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g);
    if (m3u8s && m3u8s[0]) {
      if (await probeRange(m3u8s[0])) out.push(m3u8s[0]);
    }
  } catch (e: unknown) {
    notes.push(`vidstream: ${errorMessage(e)}`);
  }
  return out;
}

async function resolveHydraX(embed: string, notes: string[]): Promise<string[]> {
  const out: string[] = [];
  try {
    const page = await fetchText(embed, `${SITE}/`);
    const iframe = page.match(/<iframe[^>]+src="([^"]+)"/);
    if (!iframe) {
      notes.push("hydrax: no iframe");
      return out;
    }
    const src = decodeURIComponent(iframe[1]);
    const vpage = await fetchText(src, embed);
    const m3u8s = vpage.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g);
    if (m3u8s) {
      const probed = await Promise.all(m3u8s.slice(0, 3).map((m) => probeRange(m)));
      const idx = probed.findIndex((alive) => alive);
      if (idx >= 0) out.push(m3u8s[idx]);
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
    const vpage = await fetchText(src, embed);
    const mp4s = vpage.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g);
    if (mp4s) {
      const probed = await Promise.all(mp4s.slice(0, 5).map((m) => probeRange(m)));
      const idx = probed.findIndex((alive) => alive);
      if (idx >= 0) out["720p"] = mp4s[idx];
    }
  } catch {}
  return out;
}

export type FastResolve = {
  episodeId: number;
  seriesId: number;
  resolvedAt: number;
  hls: HlsSession | null;
  notes: string[];
};

export type Mp4Resolve = {
  episodeId: number;
  seriesId: number;
  resolvedAt: number;
  mp4: Record<string, string>;
  hlsExtra: HlsCandidate[];
  notes: string[];
};

export async function resolveHlsSession(episodeId: number, seriesId: number, force = false): Promise<FastResolve> {
  const key = `${seriesId}:${episodeId}`;
  const hit = sessions.get(key);
  if (!force && hit && hit.hls && Date.now() - hit.resolvedAt < SESSION_TTL) {
    return { episodeId, seriesId, resolvedAt: hit.resolvedAt, hls: hit.hls, notes: hit.notes };
  }

  const notes: string[] = [];
  const watch = await getWatchSources(seriesId, episodeId, force);
  const vidmoly = watch.sources.find((s) => s.server === "Vidmoly");

  let hls: HlsSession | null = null;
  if (vidmoly) {
    try {
      hls = await resolveHls(vidmoly.embed, notes);
    } catch (e: unknown) {
      notes.push(`vidmoly: ${errorMessage(e)}`);
    }
  } else {
    notes.push("vidmoly: no source");
  }

  const session: StreamSession = {
    episodeId,
    seriesId,
    resolvedAt: Date.now(),
    hls,
    mp4: hit?.mp4 ?? {},
    hlsExtra: hit?.hlsExtra ?? [],
    notes,
  };
  sessions.set(key, session);
  return session;
}

const MP4_SERVERS = ["VidStream", "HydraX", "MirrorBot", "SRuby", "Omega", "Vidcloud", "Pixel", "VidSrc"];

export async function resolveMp4Session(episodeId: number, seriesId: number, force = false): Promise<Mp4Resolve> {
  const key = `${seriesId}:${episodeId}`;
  const hit = sessions.get(key);
  if (!force && hit && (Object.keys(hit.mp4).length > 0 || hit.hlsExtra.length > 0) && Date.now() - hit.resolvedAt < SESSION_TTL) {
    return { episodeId, seriesId, resolvedAt: hit.resolvedAt, mp4: hit.mp4, hlsExtra: hit.hlsExtra, notes: hit.notes };
  }

  const notes: string[] = [];
  const watch = await getWatchSources(seriesId, episodeId, force);
  const found = watch.sources.filter((s) => s.server === "NeoCDN" || MP4_SERVERS.some((n) => s.server.startsWith(n)));

  const results = await Promise.all(
    found.map(async (source) => {
      try {
        if (source.server === "NeoCDN") return { source, value: await resolveNeo(source.embed, notes) };
        if (source.server === "VidStream" || source.server === "HydraX") {
          const urls = source.server === "VidStream"
            ? await resolveVidStream(source.embed, notes)
            : await resolveHydraX(source.embed, notes);
          return {
            source,
            value: {
              mp4: {} as Record<string, string>,
              hls: urls.map((u) => ({ url: u, kind: "media" as const, server: source.server })),
            },
          };
        }
        return { source, value: { mp4: await resolveGenericMp4(source.embed), hls: [] as HlsCandidate[] } };
      } catch (e: unknown) {
        notes.push(`${source.server}: ${errorMessage(e)}`);
        return { source, value: { mp4: {} as Record<string, string>, hls: [] as HlsCandidate[] } };
      }
    })
  );

  const mp4: Record<string, string> = {};
  const hlsExtra: HlsCandidate[] = [];
  for (const { source, value } of results) {
    if (source.server === "NeoCDN") {
      Object.assign(mp4, value.mp4);
      hlsExtra.push(...value.hls);
      continue;
    }
    if (value.hls.length > 0 && !hlsExtra.some((h) => h.server === source.server)) {
      hlsExtra.push(...value.hls);
      continue;
    }
    if (Object.keys(value.mp4).length === 0) continue;
    if (!mp4["720p"]) mp4["720p"] = value.mp4["720p"] ?? Object.values(value.mp4)[0];
  }

  const session: StreamSession = {
    episodeId,
    seriesId,
    resolvedAt: Date.now(),
    hls: hit?.hls ?? null,
    mp4,
    hlsExtra,
    notes,
  };
  sessions.set(key, session);
  return session;
}

export async function resolveSession(episodeId: number, seriesId: number, force = false): Promise<StreamSession> {
  const key = `${seriesId}:${episodeId}`;
  const hit = sessions.get(key);
  if (!force && hit && Date.now() - hit.resolvedAt < SESSION_TTL) return hit;

  const fast = await resolveHlsSession(episodeId, seriesId, force);
  const slow = await resolveMp4Session(episodeId, seriesId, force);
  const merged: StreamSession = {
    episodeId,
    seriesId,
    resolvedAt: Date.now(),
    hls: fast.hls,
    mp4: slow.mp4,
    hlsExtra: slow.hlsExtra,
    notes: [...fast.notes, ...slow.notes],
  };
  sessions.set(key, merged);
  return merged;
}

export type ParallelResolve = {
  episodeId: number;
  seriesId: number;
  hls: HlsSession | null;
  mp4: Record<string, string>;
  hlsExtra: HlsCandidate[];
  notes: string[];
};

/**
 * Resolve HLS and MP4 concurrently and return as soon as either yields a
 * playable source, so a broken HLS CDN does not serialise behind the MP4
 * probes.
 */
export async function resolveParallel(
  episodeId: number,
  seriesId: number,
  force = false
): Promise<ParallelResolve> {
  type HlsBranch = { ok: boolean; hls: HlsSession | null; notes: string[] };
  type Mp4Branch = { ok: boolean; mp4: Record<string, string>; hlsExtra: HlsCandidate[]; notes: string[] };

  const hlsPromise: Promise<HlsBranch> = resolveHlsSession(episodeId, seriesId, force)
    .then((r) => ({ ok: r.hls !== null, hls: r.hls, notes: r.notes }))
    .catch((e: unknown) => ({ ok: false, hls: null, notes: [`hls: ${errorMessage(e)}`] }));

  const mp4Promise: Promise<Mp4Branch> = resolveMp4Session(episodeId, seriesId, force)
    .then((r) => ({
      ok: Object.keys(r.mp4).length > 0 || r.hlsExtra.length > 0,
      mp4: r.mp4,
      hlsExtra: r.hlsExtra,
      notes: r.notes,
    }))
    .catch((e: unknown) => ({ ok: false, mp4: {}, hlsExtra: [], notes: [`mp4: ${errorMessage(e)}`] }));

  const box: { hls: HlsBranch | null; mp4: Mp4Branch | null } = { hls: null, mp4: null };

  const hlsDone = hlsPromise.then((r) => {
    box.hls = r;
    return r;
  });
  const mp4Done = mp4Promise.then((r) => {
    box.mp4 = r;
    return r;
  });

  // Resolve on the first branch that yields a playable source. The other
  // branch keeps running and populates the session cache for later reads.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), PARALLEL_DEADLINE_MS);
  });

  await Promise.race([
    hlsDone.then((r) => (r.ok ? "hls" : new Promise<never>(() => {}))),
    mp4Done.then((r) => (r.ok ? "mp4" : new Promise<never>(() => {}))),
    deadline,
  ]).catch(() => undefined);
  if (timer) clearTimeout(timer);

  const hlsResult = box.hls;
  const mp4Result = box.mp4;
  const notes = [...(hlsResult?.notes ?? []), ...(mp4Result?.notes ?? [])];

  // The individual resolvers merge their fields into the shared session as
  // they land, so no extra write is needed here.
  return {
    episodeId,
    seriesId,
    hls: hlsResult?.hls ?? null,
    mp4: mp4Result?.mp4 ?? {},
    hlsExtra: mp4Result?.hlsExtra ?? [],
    notes,
  };
}
