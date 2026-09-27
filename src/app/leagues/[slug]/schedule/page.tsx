import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  listLeaguePolls,
  listPastNights,
  listUpcomingNights,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { getOrganizerView } from "@/lib/organizer-mode";
import { AppChrome, StatusBadge } from "@/app/components/AppChrome";
import { GameNightCard } from "@/app/components/GameNightCard";
import { formatDate } from "@/lib/format";
import { formatPollDate } from "@/lib/schedule-types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return {};

  const upcoming = await listUpcomingNights(league.id, 3);
  const title = `Draft night calendar · ${league.name}`;
  const description =
    upcoming.length === 0
      ? "No dates on the calendar yet."
      : `Next up: ${upcoming
          .map((n) => formatPollDate(n.startsAt))
          .join(" · ")}. Tap to say if you're in.`;

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const [upcoming, past, polls, me, view] = await Promise.all([
    listUpcomingNights(league.id),
    listPastNights(league.id),
    listLeaguePolls(league.id),
    getCurrentLeaguePlayer(league.id),
    getOrganizerView(league),
  ]);

  return (
    <AppChrome
      league={league}
      player={me}
      isOrganizer={view.isOrganizer}
      organizerMode={view.organizerMode}
      active="schedule"
    >
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="mt-1 text-sm text-ink-dim">
            RSVP to any night and change your mind whenever. Polls settle a
            date that isn&apos;t on the calendar yet.
          </p>
        </div>

        <section className="mb-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="label-caps text-ink-dim">Game nights</h2>
            {view.organizerMode && (
              <Link
                href={`/leagues/${league.slug}/schedule/nights/new`}
                className="flex min-h-11 items-center rounded-[8px] px-4 text-sm btn-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
              >
                Open dates
              </Link>
            )}
          </div>

          {upcoming.length === 0 ? (
            <div className="surface-card p-5 text-sm text-ink-dim">
              No dates on the calendar yet.
              {view.organizerMode
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
                  organizerMode={view.organizerMode}
                />
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <details className="mt-3 rounded-[10px] border border-line bg-surface px-4 py-3">
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="label-caps text-ink-dim">Date polls</h2>
              <p className="mt-2 text-sm text-ink-dim">
                Propose a few dates and let everyone vote.
              </p>
            </div>
            <Link
              href={`/leagues/${league.slug}/schedule/new`}
              className="flex min-h-11 items-center rounded-[8px] px-4 text-sm btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              Propose dates
            </Link>
          </div>

          {polls.length === 0 ? (
            <div className="surface-card p-5 text-sm text-ink-dim">
              No polls yet. Propose a few dates to get an off-calendar draft
              night settled.
            </div>
          ) : (
            <ul className="space-y-2">
              {polls.map((poll) => (
                <li key={poll.id}>
                  <Link
                    href={`/leagues/${league.slug}/schedule/${poll.id}`}
                    className="flex min-h-14 items-center justify-between gap-4 surface-card px-4 py-3 transition hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
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
