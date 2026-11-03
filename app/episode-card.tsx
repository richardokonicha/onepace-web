"use client";

import Link from "next/link";
import { getProgressPercent } from "@/lib/watch-progress";
import { usePrefetchResolve } from "./use-prefetch-resolve";
import { useWatchProgressMap } from "./watch-progress-provider";

type EpisodeCardProps = {
  id: number;
  label: string;
  name: string;
};

export function EpisodeCard({ id, label, name }: EpisodeCardProps) {
  const { prefetch, schedulePrefetch, cancelPrefetch } = usePrefetchResolve(id);
  const progress = useWatchProgressMap()[id];
  const percent = getProgressPercent(progress);

  return (
    <Link
      href={`/watch/${id}`}
      data-episode-id={id}
      className="block border border-white/10 rounded overflow-hidden hover:border-white/40 focus:border-white/60 focus:outline-none"
      onMouseEnter={schedulePrefetch}
      onMouseLeave={cancelPrefetch}
      onFocus={prefetch}
      onBlur={cancelPrefetch}
    >
      <div className="aspect-video bg-white/5 relative">
        {percent > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
            <div
              className="h-full bg-white/80"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
      <div className="p-2">
        <div className="text-xs text-white/60">{label}</div>
        <div className="text-sm truncate">{name}</div>
        {percent > 0 && (
          <div className="text-xs text-white/50 mt-1">
            Continue · {percent}%
          </div>
        )}
      </div>
    </Link>
  );
}
