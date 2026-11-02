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
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="p-6 text-white/60">Episode {episodeId} not found in the One Pace library.</div>
      </main>
    );
  }

  return <WatchClient assets={assets} initialIndex={initialIndex} />;
}