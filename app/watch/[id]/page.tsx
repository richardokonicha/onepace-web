import { getSeriesAssets, findAssetIndex } from "@/lib/player-assets";
import { WatchClient } from "./watch-client";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const episodeId = Number(id);

  if (!Number.isFinite(episodeId) || episodeId <= 0) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="p-6 text-white/60">Invalid episode id.</div>
      </main>
    );
  }

  const assets = await getSeriesAssets(98);
  const initialIndex = findAssetIndex(assets, episodeId);

  if (initialIndex === -1) {
    // Not in the One Pace library. Later anime episodes (1150-1180) are
    // published by AniWixi as a direct MP4, so route the id straight through
    // the resolver instead of showing a dead end.
    if (episodeId >= 1000) {
      return (
        <WatchClient
          assets={[
            {
              id: `anime-${episodeId}`,
              episodeId,
              arc: "Anime",
              episode: episodeId,
              title: `Episode ${episodeId}`,
            },
          ]}
          initialIndex={0}
        />
      );
    }

    return (
      <main className="min-h-screen bg-black text-white">
        <div className="p-6 text-white/60">Episode {episodeId} not found in the One Pace library.</div>
      </main>
    );
  }

  return <WatchClient assets={assets} initialIndex={initialIndex} />;
}