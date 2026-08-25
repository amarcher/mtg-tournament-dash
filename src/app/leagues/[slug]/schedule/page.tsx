import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  listLeaguePolls,
  listPastNights,
  listUpcomingNights,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { isLeagueOrganizer } from "@/lib/authz";
import { AppChrome, StatusBadge } from "@/app/components/AppChrome";
import { GameNightCard } from "@/app/components/GameNightCard";
import { formatDate } from "@/lib/format";
import { formatPollDate } from "@/lib/schedule-types";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const [upcoming, past, polls, me, organizer] = await Promise.all([
    listUpcomingNights(league.id),
    listPastNights(league.id),
    listLeaguePolls(league.id),
    getCurrentLeaguePlayer(league.id),
    isLeagueOrganizer(league),
  ]);

  return (
    <AppChrome
      league={league}
      player={me}
      isOrganizer={organizer}
      active="schedule"
    >
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Draft night scheduling
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            The calendar is the standing set of dates — RSVP to any of them,
            and change your mind whenever. Polls are for settling a date that
            isn&apos;t on it yet.
          </p>
        </div>

        <section className="mb-12">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-medium text-zinc-200">The calendar</h2>
            {organizer && (
              <Link
                href={`/leagues/${league.slug}/schedule/nights/new`}
                className="flex min-h-11 items-center rounded-md bg-amber-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 active:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
              >
                Open dates
              </Link>
            )}
          </div>

          {upcoming.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-500">
              No dates on the calendar yet.
              {organizer
                ? " Open a run — every other Monday, say — and the league starts RSVPing."
                : " An organizer can open a run of dates."}
            </div>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((night) => (
                <GameNightCard
                  key={night.id}
                  night={night}
                  leagueSlug={league.slug}
                  playerId={me?.id}
                />
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <details className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <summary className="cursor-pointer text-sm text-zinc-400">
                {past.length} past night{past.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-3 space-y-1">
                {past.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/leagues/${league.slug}/schedule/nights/${n.id}`}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm text-zinc-400 transition hover:bg-zinc-800/60 active:bg-zinc-800"
                    >
                      <span>{formatPollDate(n.startsAt)}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {n.setName ?? (n.status === "canceled" ? "canceled" : "—")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-200">Date polls</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Doodle-style: propose a few candidates, pick the winner.
              </p>
            </div>
            <Link
              href={`/leagues/${league.slug}/schedule/new`}
              className="flex min-h-11 items-center rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 active:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              Propose dates
            </Link>
          </div>

          {polls.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-500">
              No polls yet. Propose a few dates to get an off-calendar draft
              night settled.
            </div>
          ) : (
            <ul className="space-y-2">
              {polls.map((poll) => (
                <li key={poll.id}>
                  <Link
                    href={`/leagues/${league.slug}/schedule/${poll.id}`}
                    className="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4 transition hover:border-zinc-700 hover:bg-zinc-800/60 active:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="truncate font-medium">{poll.title}</span>
                      <StatusBadge status={poll.status} />
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {formatDate(poll.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppChrome>
  );
}
