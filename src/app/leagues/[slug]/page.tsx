import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  listLeaguePlayers,
  listOpenEventsForPlayer,
  listOpenLeagueEvents,
  listLeagueEvents,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LeagueHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [players, openEvents, allEvents, me] = await Promise.all([
    listLeaguePlayers(league.id),
    listOpenLeagueEvents(league.id),
    listLeagueEvents(league.id),
    getCurrentLeaguePlayer(league.id),
  ]);
  const completedEvents = allEvents.filter((e) => e.status === "complete");
  const myOpenEvents = me
    ? await listOpenEventsForPlayer(league.id, me.id)
    : [];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="mb-10">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← All leagues
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">
            {league.name}
          </h1>
          <div className="flex flex-wrap gap-2 text-sm">
            {me ? (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                You: {me.displayName}
              </span>
            ) : null}
            <Link
              href={`/leagues/${league.slug}/claim`}
              className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
            >
              {me ? "Switch player" : "Claim your wizard"}
            </Link>
            <Link
              href={`/leagues/${league.slug}/events/new`}
              className="rounded-full bg-amber-500 px-3 py-1 font-semibold text-zinc-950 hover:bg-amber-400"
            >
              New event
            </Link>
          </div>
        </div>
      </div>

      {me && myOpenEvents.length > 0 && (
        <section className="mb-10 space-y-2">
          {myOpenEvents.map(({ event, activeMatch }) => (
            <Link
              key={event.id}
              href={`/events/${event.id}/play`}
              className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 transition hover:border-amber-500 hover:bg-amber-500/20"
            >
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
                  {activeMatch ? "Your match is live" : "You're on the roster"}
                </div>
                <div className="mt-0.5 truncate text-lg font-semibold text-amber-100">
                  {event.name}
                </div>
                <div className="text-xs text-amber-200/70">
                  {activeMatch
                    ? "Tap to open the scorekeeper"
                    : "Tap to stand by — auto-jumps when the round starts"}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950">
                ▶ Scorekeeper
              </span>
            </Link>
          ))}
        </section>
      )}

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-medium text-zinc-300">
          Active events
        </h2>
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

      <section className="mb-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-zinc-300">Leaderboard</h2>
          {players.length > 10 && (
            <span className="text-xs text-zinc-500">
              {players.length} players
            </span>
          )}
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No wizards yet.{" "}
            <Link
              href={`/leagues/${league.slug}/claim`}
              className="text-amber-400 hover:text-amber-300"
            >
              Be the first.
            </Link>
          </p>
        ) : (
          <ol className="space-y-1">
            {players.slice(0, 10).map((p, i) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2"
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 text-right font-mono text-xs text-zinc-500">
                    {i + 1}
                  </span>
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.avatarUrl}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover ring-1 ring-zinc-700"
                    />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-zinc-600 font-mono text-xs text-zinc-500">
                      {p.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
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

      {completedEvents.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-medium text-zinc-300">
            Past events
          </h2>
          <ul className="space-y-1">
            {completedEvents.slice(0, 10).map((e) => (
              <li
                key={e.id}
                className="flex items-baseline justify-between rounded-md bg-zinc-900/30 px-4 py-2 text-sm"
              >
                <Link
                  href={`/events/${e.id}/manage`}
                  className="font-medium hover:text-amber-400"
                >
                  {e.name}
                </Link>
                <span className="text-xs text-zinc-500">
                  {new Date(e.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

    </main>
  );
}
