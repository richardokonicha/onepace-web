"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Hls from "hls.js";

type Candidate = {
  type: "hls" | "mp4";
  quality: string;
  codec?: string;
  proxyUrl: string;
};

type State = {
  candidates: Candidate[];
  idx: number;
  err: string | null;
  loading: boolean;
};

const INITIAL: State = { candidates: [], idx: 0, err: null, loading: true };
const MAX_RETRIES = 3;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function WatchClient({ episodeId }: { episodeId: number }) {
  const [state, setState] = useState<State>(INITIAL);
  const retries = useRef(0);
  const generation = useRef(0);
  const stateRef = useRef<State>(state);
  stateRef.current = state;

  const load = useCallback(
    async (fresh = false) => {
      if (!Number.isFinite(episodeId) || episodeId <= 0) {
        setState({ ...INITIAL, loading: false, err: "invalid episode id" });
        return;
      }
      const gen = ++generation.current;
      setState((s) => ({ ...s, loading: true, err: null }));
      try {
        const res = await fetch(`/api/resolve?id=${episodeId}${fresh ? "&fresh=1" : ""}`);
        const data = await res.json();
        if (gen !== generation.current) return;
        if (data.error) throw new Error(data.error);
        const candidates: Candidate[] = data.candidates || [];
        setState({ candidates, idx: 0, err: null, loading: false });
        retries.current = 0;
      } catch (e: unknown) {
        if (gen !== generation.current) return;
        setState((s) => ({ ...s, loading: false, err: errorMessage(e) }));
      }
    },
    [episodeId]
  );

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const onSourceError = useCallback(() => {
    const s = stateRef.current;
    if (s.idx + 1 < s.candidates.length) {
      setState((prev) => ({ ...prev, idx: prev.idx + 1 }));
      return;
    }
    if (retries.current < MAX_RETRIES) {
      retries.current += 1;
      void load(true);
      return;
    }
    setState((prev) => ({ ...prev, err: "all sources failed" }));
  }, [load]);

  const { candidates, idx, err, loading } = state;
  const current = candidates[idx];

  useEffect(() => {
    if (!current) return;
    const video = document.getElementById("player") as HTMLVideoElement | null;
    if (!video) return;

    if (current.type === "hls" && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, startLevel: -1 });
      let retried = false;
      let stopped = false;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || stopped) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !retried) {
          retried = true;
          hls.startLoad();
          setTimeout(() => {
            if (!stopped) onSourceError();
          }, 5000);
          return;
        }
        stopped = true;
        hls.destroy();
        onSourceError();
      });
      hls.loadSource(current.proxyUrl);
      hls.attachMedia(video);
      return () => {
        stopped = true;
        hls.destroy();
      };
    }

    video.src = current.proxyUrl;
    video.onerror = onSourceError;
    void video.play().catch(() => {});
    return () => {
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [current, onSourceError]);

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 p-4 flex items-center gap-4">
        <Link href="/" className="text-white/60 hover:text-white">
          ← Back
        </Link>
        <div className="text-sm">Episode {episodeId}</div>
        {current && (
          <div className="text-sm text-white/50">
            {current.type} {current.quality} {current.codec || ""}
          </div>
        )}
        {candidates.length > 0 && (
          <div className="text-sm text-white/40">
            source {idx + 1}/{candidates.length}
          </div>
        )}
      </header>
      <div className="p-4 space-y-3">
        {loading && <div className="text-white/60">Resolving stream…</div>}
        {err && (
          <div className="text-red-400">
            {err}{" "}
            <button className="underline" onClick={() => void load(true)}>
              retry
            </button>
          </div>
        )}
        {candidates.length === 0 && !loading && !err && (
          <div className="text-white/60">
            No playable source found.{" "}
            <button className="underline" onClick={() => void load(true)}>
              retry
            </button>
          </div>
        )}
        {current && (
          <div className="max-w-6xl mx-auto">
            <video
              id="player"
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-black"
              onError={onSourceError}
            />
          </div>
        )}
      </div>
    </main>
  );
}
