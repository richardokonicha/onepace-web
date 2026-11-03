"use client";

import { isResumable } from "@/lib/watch-progress";
import { EpisodeCard } from "./episode-card";
import { useWatchProgressMap } from "./watch-progress-provider";

export type ContinueWatchingEpisode = {
  id: number;
  label: string;
  name: string;
};

type ContinueWatchingProps = {
  episodes: ContinueWatchingEpisode[];
};

/**
 * The episodes that were left in the middle.
 *
 * The row is empty until something was watched, so it only shows up once it
 * has something to offer.
 */
export function ContinueWatching({ episodes }: ContinueWatchingProps) {
  const progress = useWatchProgressMap();

  const resumable = episodes
    .filter((episode) => isResumable(progress[episode.id]))
    .sort(
      (a, b) =>
        (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0)
    );

  if (resumable.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="text-lg mb-3">Continue watching</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {resumable.map((episode) => (
          <EpisodeCard
            key={episode.id}
            id={episode.id}
            label={episode.label}
            name={episode.name}
          />
        ))}
      </div>
    </section>
  );
}
