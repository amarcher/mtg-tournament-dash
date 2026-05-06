import Link from "next/link";
import { listAllPlayers, listOpenEvents } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [players, openEvents] = await Promise.all([
    listAllPlayers(),
    listOpenEvents(),
  ]);

  return (
    <main className="mx-auto max-w-4xl w-full px-6 py-12">
      <div className="mb-12 flex items-baseline justify-between">
        <h1 className="text-4xl font-semibold tracking-tight">MTG Dash</h1>
        <Link
          href="/events/new"
          className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
        >
          New event
        </Link>
      </div>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-medium text-zinc-300">Active events</h2>
        {openEvents.length === 0 ? (
          <p className="text-sm text-zinc-500">No events in progress.</p>
        ) : (
          <ul className="space-y-2">
            {openEvents.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4"
              >
                <div>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-zinc-500">
                    {e.format} · {e.totalRounds} rounds · {e.status}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  <Link
                    className="rounded-md bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700"
                    href={`/events/${e.id}/manage`}
                  >
                    Manage
                  </Link>
                  <Link
                    className="rounded-md bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700"
                    href={`/events/${e.id}/broadcast`}
                  >
                    Broadcast
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-zinc-300">Leaderboard</h2>
          <Link href="/players" className="text-xs text-zinc-500 hover:text-zinc-300">
            All players →
          </Link>
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No players yet. Add some when creating your first event.
          </p>
        ) : (
          <ol className="space-y-1">
            {players.slice(0, 10).map((p, i) => (
              <li
                key={p.id}
                className="flex items-baseline justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2"
              >
                <span className="flex items-baseline gap-3">
                  <span className="w-6 text-right font-mono text-xs text-zinc-500">
                    {i + 1}
                  </span>
                  <Link
                    href={`/players/${p.id}`}
                    className="font-medium hover:text-amber-400"
                  >
                    {p.displayName}
                  </Link>
                </span>
                <span className="font-mono text-sm text-zinc-400">
                  {p.currentElo}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
