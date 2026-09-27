import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  listLeagueEvents,
  listLeaguePlayers,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { getOrganizerView } from "@/lib/organizer-mode";
import { AppChrome } from "@/app/components/AppChrome";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** The League tab: who's on top, and what's been played. */
export default async function StandingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [players, allEvents, me, view] = await Promise.all([
    listLeaguePlayers(league.id),
    listLeagueEvents(league.id),
    getCurrentLeaguePlayer(league.id),
    getOrganizerView(league),
  ]);
  const completedEvents = allEvents.filter((e) => e.status === "complete");

  return (
    <AppChrome
      league={league}
      player={me}
      isOrganizer={view.isOrganizer}
      organizerMode={view.organizerMode}
      active="league"
    >
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Standings</h1>
          <p className="mt-1 text-sm text-ink-dim">
            {players.length} wizard{players.length === 1 ? "" : "s"} ·{" "}
            {completedEvents.length} event
            {completedEvents.length === 1 ? "" : "s"} played · ranked by ELO
          </p>
        </div>

        {players.length === 0 ? (
          <p className="surface-card p-5 text-sm text-ink-dim">
            No wizards yet.{" "}
            <Link
              href={`/leagues/${league.slug}/claim`}
              className="font-semibold text-gold hover:underline"
            >
              Be the first.
            </Link>
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {players.map((p, i) => {
              const isMe = me?.id === p.id;
              return (
                <li key={p.id}>
                  <Link
                    href={`/players/${p.id}`}
                    className={`flex min-h-14 items-center gap-3 rounded-[10px] border px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
                      isMe
                        ? "border-line-strong bg-amber-500/[0.07]"
                        : "border-line bg-surface hover:border-line-strong"
                    }`}
                  >
                    <span
                      className={`w-7 shrink-0 text-right font-numeral text-sm font-bold tabular-nums ${
                        i < 3 ? "text-gold" : "text-ink-faint"
                      }`}
                    >
                      {i + 1}
                    </span>
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line-strong"
                      />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-sm font-bold text-gold ring-1 ring-line-strong">
                        {p.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {p.displayName}
                      {isMe && (
                        <span className="label-caps ml-2 text-gold">You</span>
                      )}
                    </span>
                    <span className="shrink-0 font-numeral text-base font-bold tabular-nums">
                      {p.currentElo}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        {completedEvents.length > 0 && (
          <section aria-labelledby="past-h" className="flex flex-col gap-2">
            <h2 id="past-h" className="label-caps text-ink-dim">
              Past events
            </h2>
            <ul className="surface-card divide-y divide-white/5 px-4">
              {completedEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    href={
                      view.organizerMode
                        ? `/events/${e.id}/manage`
                        : `/events/${e.id}/broadcast`
                    }
                    className="flex min-h-12 items-center justify-between gap-3 py-2 transition hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                  >
                    <span className="min-w-0 truncate font-medium">{e.name}</span>
                    <span className="shrink-0 text-sm text-ink-dim">
                      {formatDate(e.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </AppChrome>
  );
}
