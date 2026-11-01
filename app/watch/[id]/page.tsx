import { WatchClient } from "./watch-client";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const episodeId = Number(id);
  return <WatchClient episodeId={Number.isFinite(episodeId) ? episodeId : 0} />;
}
