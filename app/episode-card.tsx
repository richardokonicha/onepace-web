"use client";

import Link from "next/link";
import { usePrefetchResolve } from "./use-prefetch-resolve";

type EpisodeCardProps = {
  id: number;
  label: string;
  name: string;
};

export function EpisodeCard({ id, label, name }: EpisodeCardProps) {
  const { prefetch, schedulePrefetch, cancelPrefetch } = usePrefetchResolve(id);

  return (
    <Link
      href={`/watch/${id}`}
      className="block border border-white/10 rounded overflow-hidden hover:border-white/40 focus:border-white/60 focus:outline-none"
      onMouseEnter={schedulePrefetch}
      onMouseLeave={cancelPrefetch}
      onFocus={prefetch}
      onBlur={cancelPrefetch}
    >
      <div className="aspect-video bg-white/5" />
      <div className="p-2">
        <div className="text-xs text-white/60">{label}</div>
        <div className="text-sm truncate">{name}</div>
      </div>
    </Link>
  );
}
