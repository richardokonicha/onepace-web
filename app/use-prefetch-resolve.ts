"use client";

import { useCallback, useRef } from "react";

const prefetched = new Set<string>();

export function usePrefetchResolve(episodeId: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefetch = useCallback(() => {
    if (!Number.isFinite(episodeId) || episodeId <= 0) return;
    const key = `ep:${episodeId}`;
    if (prefetched.has(key)) return;
    prefetched.add(key);
    void fetch(`/api/resolve?id=${episodeId}`).catch(() => {
      prefetched.delete(key);
    });
  }, [episodeId]);

  const schedulePrefetch = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      prefetch();
    }, 120);
  }, [prefetch]);

  const cancelPrefetch = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  return { prefetch, schedulePrefetch, cancelPrefetch };
}
