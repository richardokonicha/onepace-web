import { getLibrary } from "@/lib/library";
import { ContinueWatching } from "./continue-watching";
import { EpisodeCard } from "./episode-card";
import { PREFETCH_BOOT } from "./prefetch-boot";
import { WatchProgressProvider } from "./watch-progress-provider";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { arcs } = await getLibrary(98);
  const episodes = arcs.flatMap((arc) =>
    arc.episodes.map((ep) => ({ id: ep.id, label: ep.label, name: ep.name }))
  );

  return (
    <main className="min-h-screen bg-black text-white">
      <script dangerouslySetInnerHTML={{ __html: PREFETCH_BOOT }} />
      <header className="border-b border-white/10 p-6">
        <h1 className="text-2xl font-semibold">One Pace</h1>
        <p className="text-white/60">Browse arcs and watch episodes</p>
      </header>
      <WatchProgressProvider>
        <div className="p-6 space-y-6">
          <ContinueWatching episodes={episodes} />
          {arcs.map((arc) => (
            <section key={arc.season}>
              <h2 className="text-lg mb-3">{arc.label}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {arc.episodes.map((ep) => (
                  <EpisodeCard key={ep.id} id={ep.id} label={ep.label} name={ep.name} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </WatchProgressProvider>
    </main>
  );
}
