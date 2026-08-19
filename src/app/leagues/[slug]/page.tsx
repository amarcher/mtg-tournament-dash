import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLatestLeaguePoll,
  getLeagueBySlug,
  getEventRounds,
  getPollDetail,
  getRoundMatches,
  listLeaguePlayers,
  listOpenEventsForPlayer,
  listOpenLeagueEvents,
  listLeagueEvents,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { isLeagueOrganizer } from "@/lib/authz";
import { findActiveBonusGameForPlayer } from "@/lib/bonus-game";
import { createBonusGameAction } from "@/app/events/actions";
import { AppChrome, StatusBadge } from "@/app/components/AppChrome";
import { formatDate } from "@/lib/format";
import { formatPollDate } from "@/lib/schedule-types";
import { pickLeadingOptionId } from "@/lib/poll-tally";

export const dynamic = "force-dynamic";

export default async function LeagueHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [players, openEvents, allEvents, me, latestPoll, organizer] =
    await Promise.all([
      listLeaguePlayers(league.id),
      listOpenLeagueEvents(league.id),
      listLeagueEvents(league.id),
      getCurrentLeaguePlayer(league.id),
      getLatestLeaguePoll(league.id),
      isLeagueOrganizer(league),
    ]);
  const pollOptions = latestPoll ? await getPollDetail(latestPoll.id) : [];
  const pollVoterCount = new Set(
    pollOptions.flatMap((o) => o.votes.map((v) => v.playerId))
  ).size;
  const pollWinner =
    latestPoll?.status === "finalized"
      ? pollOptions.find((o) => o.id === latestPoll.finalizedOptionId) ?? null
      : null;
  const pollLeadingId = pickLeadingOptionId(
    pollOptions.map((o) => ({
      id: o.id,
      startsAt: o.startsAt,
      responses: o.votes.map((v) => v.response),
    }))
  );
  const pollLeading =
    pollOptions.find((o) => o.id === pollLeadingId) ?? null;
  const completedEvents = allEvents.filter((e) => e.status === "complete");
  const myOpenEvents = me
    ? await listOpenEventsForPlayer(league.id, me.id)
    : [];
  const myBonusGame = me
    ? await findActiveBonusGameForPlayer(league.id, me.id)
    : null;
  const myOpenEventIds = new Set(myOpenEvents.map(({ event }) => event.id));
  const activeSummaries = await Promise.all(
    openEvents.map(async (event) => {
      const eventRounds = await getEventRounds(event.id);
      const activeRound = eventRounds.find((r) => r.status === "active");
      const pendingRound = eventRounds.find((r) => r.status === "pending");
      const currentRound = activeRound ?? pendingRound ?? null;
      const matches = currentRound ? await getRoundMatches(currentRound.id) : [];
      const incompleteCount = activeRound
        ? matches.filter(({ match }) => match.status !== "complete").length
        : 0;
      const completedCount = eventRounds.filter((r) => r.status === "complete")
        .length;
      return {
        event,
        currentRound,
        incompleteCount,
        completedCount,
        isMine: myOpenEventIds.has(event.id),
      };
    })
  );

  return (
    <AppChrome league={league} player={me} isOrganizer={organizer} active="league">
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {league.name}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Game-night command center for events, players, and league history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/leagues/${league.slug}/claim`}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              {me ? "Switch player" : "Claim wizard"}
            </Link>
            {organizer && (
              <Link
                href={`/leagues/${league.slug}/events/new`}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
              >
                New event
              </Link>
            )}
          </div>
        </div>

        <section className="mb-8 grid gap-3 md:grid-cols-3">
          <DashboardStat label="Wizards" value={players.length} />
          <DashboardStat label="Open events" value={openEvents.length} />
          <DashboardStat label="Completed events" value={completedEvents.length} />
        </section>

      {latestPoll && latestPoll.status === "open" && (
        <section className="mb-10">
          <Link
            href={`/leagues/${league.slug}/schedule/${latestPoll.id}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-4 transition hover:border-amber-500/60 hover:bg-zinc-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Scheduling · {pollVoterCount} of {players.length} voted
              </div>
              <div className="mt-0.5 truncate text-lg font-semibold">
                {latestPoll.title}
              </div>
              <div className="text-xs text-zinc-500">
                {pollLeading
                  ? `Leading: ${formatPollDate(pollLeading.startsAt)}`
                  : "No availability marked yet"}
              </div>
            </div>
            <span className="shrink-0 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950">
              Vote
            </span>
          </Link>
        </section>
      )}

      {pollWinner && (
        <section className="mb-10">
          <Link
            href={`/leagues/${league.slug}/schedule/${latestPoll!.id}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-4 transition hover:border-emerald-500 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">
                Next draft night
              </div>
              <div className="mt-0.5 truncate text-lg font-semibold text-emerald-100">
                {formatPollDate(pollWinner.startsAt)}
              </div>
            </div>
            <span className="shrink-0 text-xs text-emerald-200/70">
              {latestPoll!.title}
            </span>
          </Link>
        </section>
      )}

      {me && myOpenEvents.length > 0 && (
        <section className="mb-10 space-y-2">
          {myOpenEvents.map(({ event, activeMatch }) => (
            <Link
              key={event.id}
              href={`/events/${event.id}/play`}
              className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-5 py-4 transition hover:border-amber-500 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
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
              <span className="shrink-0 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950">
                Scorekeeper
              </span>
            </Link>
          ))}
        </section>
      )}

      {me && (
        <section className="mb-10">
          {myBonusGame ? (
            <Link
              href={`/matches/${myBonusGame.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-4 transition hover:border-emerald-500 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            >
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">
                  Bonus Game in progress
                </div>
                <div className="mt-0.5 truncate text-lg font-semibold text-emerald-100">
                  Return to your Bonus Game
                </div>
              </div>
              <span className="shrink-0 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950">
                Resume
              </span>
            </Link>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Bonus Game
                </div>
                <div className="mt-0.5 text-sm text-zinc-400">
                  Pair up with any wizard for a casual head-to-head — games
                  until you quit, no ELO on the line.
                </div>
              </div>
              <form
                action={createBonusGameAction}
                className="flex shrink-0 flex-wrap items-center gap-2"
              >
                <input type="hidden" name="leagueSlug" value={league.slug} />
                <label htmlFor="league-bonus-opponent" className="sr-only">
                  Opponent
                </label>
                <select
                  id="league-bonus-opponent"
                  name="opponentId"
                  defaultValue=""
                  className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-base"
                >
                  <option value="">Anyone — show a QR code</option>
                  {players
                    .filter((p) => p.id !== me.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                </select>
                <label htmlFor="league-bonus-life" className="sr-only">
                  Starting life
                </label>
                <select
                  id="league-bonus-life"
                  name="startingLife"
                  defaultValue="20"
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-base"
                >
                  <option value="20">20 life</option>
                  <option value="40">40 life</option>
                </select>
                <button
                  type="submit"
                  className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                >
                  Start a Bonus Game
                </button>
              </form>
            </div>
          )}
        </section>
      )}

      <section className="mb-12">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium text-zinc-200">Active events</h2>
          <Link
            href={`/leagues/${league.slug}/claim`}
            className="text-sm text-amber-400 transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Join as player
          </Link>
        </div>
        {openEvents.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-500">
            No events in progress.
          </div>
        ) : (
          <ul className="grid gap-3">
            {activeSummaries.map(({ event: e, currentRound, incompleteCount, completedCount, isMine }) => (
              <li
                key={e.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-semibold">{e.name}</h3>
                      <StatusBadge status={e.status} />
                    </div>
                    <div className="mt-1 text-sm text-zinc-500">
                      {currentRound
                        ? `Round ${currentRound.roundNumber} of ${e.totalRounds}`
                        : `${e.totalRounds} rounds ready`}
                      {" · "}
                      {completedCount} closed
                      {incompleteCount > 0
                        ? ` · ${incompleteCount} match${incompleteCount === 1 ? "" : "es"} pending`
                        : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {isMine ? (
                      <Link
                        className="rounded-md bg-amber-500 px-3 py-2 font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                        href={`/events/${e.id}/play`}
                      >
                        Scorekeeper
                      </Link>
                    ) : (
                      <Link
                        className="rounded-md border border-zinc-700 px-3 py-2 font-medium text-zinc-200 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                        href={`/events/${e.id}/claim`}
                      >
                        Claim seat
                      </Link>
                    )}
                    {organizer && (
                      <Link
                        className="rounded-md bg-zinc-800 px-3 py-2 font-medium transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                        href={`/events/${e.id}/manage`}
                      >
                        Manage
                      </Link>
                    )}
                    <Link
                      className="rounded-md bg-zinc-800 px-3 py-2 font-medium transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                      href={`/events/${e.id}/broadcast`}
                    >
                      Broadcast
                    </Link>
                  </div>
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
                  className="font-medium transition hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
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
                  href={
                    organizer
                      ? `/events/${e.id}/manage`
                      : `/events/${e.id}/broadcast`
                  }
                  className="font-medium transition hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                >
                  {e.name}
                </Link>
                <span className="text-xs text-zinc-500">
                  {formatDate(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      </main>
    </AppChrome>
  );
}

function DashboardStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-3">
      <div className="font-mono text-2xl tabular-nums text-zinc-100">{value}</div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}
