import Link from "next/link";
import { getLibrary } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { arcs } = await getLibrary(98);
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 p-6">
        <h1 className="text-2xl font-semibold">One Pace</h1>
        <p className="text-white/60">Browse arcs and watch episodes</p>
      </header>
      <div className="p-6 space-y-6">
        {arcs.map((arc) => (
          <section key={arc.season}>
            <h2 className="text-lg mb-3">{arc.label}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {arc.episodes.map((ep) => (
                <Link
                  key={ep.id}
                  href={`/watch/${ep.id}`}
                  className="block border border-white/10 rounded overflow-hidden hover:border-white/40"
                >
                  <div className="aspect-video bg-white/5" />
                  <div className="p-2">
                    <div className="text-xs text-white/60">{ep.label}</div>
                    <div className="text-sm truncate">{ep.name}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
