import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEventRounds,
  getLeagueBySlug,
  getRoundMatches,
  listOpenLeagueEvents,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { getOrganizerView } from "@/lib/organizer-mode";
import { setOrganizerModeAction } from "@/app/events/actions";
import { AppChrome, StatusBadge } from "@/app/components/AppChrome";
import { OrganizerGate } from "@/app/components/OrganizerGate";

export const dynamic = "force-dynamic";

/**
 * The Organize tab: every organizer entry point in one place — running
 * events, starting a new one, planning the calendar, league settings.
 */
export default async function OrganizePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [view, me, openEvents] = await Promise.all([
    getOrganizerView(league),
    getCurrentLeaguePlayer(league.id),
    listOpenLeagueEvents(league.id),
  ]);
  if (!view.isOrganizer) {
    return (
      <OrganizerGate league={league} next={`/leagues/${league.slug}/organize`} />
    );
  }

  const summaries = await Promise.all(
    openEvents.map(async (event) => {
      const rounds = await getEventRounds(event.id);
      const active = rounds.find((r) => r.status === "active");
      const pending = rounds.find((r) => r.status === "pending");
      const current = active ?? pending ?? null;
      const matches = active ? await getRoundMatches(active.id) : [];
      const waiting = matches.filter(
        ({ match }) => match.status !== "complete"
      ).length;
      return { event, current, waiting };
    })
  );
  const base = `/leagues/${league.slug}`;

  return (
    <AppChrome
      league={league}
      player={me}
      isOrganizer
      organizerMode={view.organizerMode}
      active="organize"
    >
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Organize</h1>
          <Link
            href={`${base}/events/new`}
            className="rounded-[8px] px-4 py-2.5 text-sm btn-gold"
          >
            New event
          </Link>
        </div>

        {!view.organizerMode && (
          <form
            action={setOrganizerModeAction}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-dashed border-line-strong p-4"
          >
            <input type="hidden" name="leagueId" value={league.id} />
            <input type="hidden" name="on" value="1" />
            <input type="hidden" name="next" value={`${base}/organize`} />
            <p className="min-w-0 flex-1 text-sm text-ink-dim">
              Organizer mode is off, so the rest of the app looks like it does
              for players. Turn it on for the Organize tab and scorekeeper
              shortcut.
            </p>
            <button type="submit" className="rounded-[8px] px-4 py-2.5 text-sm btn-ghost">
              Turn on
            </button>
          </form>
        )}

        <section aria-labelledby="running-h" className="flex flex-col gap-2">
          <h2 id="running-h" className="label-caps text-ink-dim">
            Events
          </h2>
          {summaries.length === 0 ? (
            <p className="surface-card p-4 text-sm text-ink-dim">
              Nothing running. Start one with New event, or promote a game
              night from the schedule.
            </p>
          ) : (
            summaries.map(({ event, current, waiting }) => (
              <div key={event.id} className="surface-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-display text-lg font-bold">
                    {event.name}
                  </span>
                  <StatusBadge status={event.status} />
                </div>
                <p className="mt-1 text-sm text-ink-dim">
                  {current
                    ? `Round ${current.roundNumber} of ${event.totalRounds}${
                        current.status === "active"
                          ? waiting > 0
                            ? ` · ${waiting} table${waiting === 1 ? "" : "s"} still playing`
                            : " · all tables reported"
                          : " · paired, not started"
                      }`
                    : `${event.totalRounds} rounds · roster open`}
                </p>
                <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-2">
                  <Link
                    href={`/events/${event.id}/manage`}
                    className="rounded-[8px] px-4 py-3 text-center text-sm btn-gold"
                  >
                    Run event →
                  </Link>
                  <Link
                    href={`/events/${event.id}/broadcast`}
                    target="_blank"
                    className="rounded-[8px] px-4 py-3 text-center text-sm btn-ghost"
                  >
                    Broadcast
                  </Link>
                </div>
              </div>
            ))
          )}
        </section>

        <section aria-labelledby="plan-h" className="flex flex-col gap-2">
          <h2 id="plan-h" className="label-caps text-ink-dim">
            Plan
          </h2>
          <div className="surface-card divide-y divide-white/5 px-1">
            <HubLink href={`${base}/schedule/nights/new`} title="Open game nights" note="Put a run of dates on the calendar for RSVPs" />
            <HubLink href={`${base}/schedule/new`} title="Propose dates" note="Ask everyone which date works best" />
            <HubLink href={`${base}/schedule`} title="Schedule" note="Plan nights, pick poll winners, create events" />
          </div>
        </section>

        <section aria-labelledby="league-h" className="flex flex-col gap-2">
          <h2 id="league-h" className="label-caps text-ink-dim">
            League
          </h2>
          <div className="surface-card divide-y divide-white/5 px-1">
            <HubLink href={`${base}/settings`} title="Settings" note="Managers, invite links and the organizer QR" />
            <HubLink href={`${base}/claim`} title="Wizards" note="Everyone in the league; add or switch wizards" />
          </div>
        </section>
      </main>
    </AppChrome>
  );
}

function HubLink({
  href,
  title,
  note,
}: {
  href: string;
  title: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center justify-between gap-3 px-3 py-3 transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
    >
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink-dim">{note}</span>
      </span>
      <span aria-hidden className="shrink-0 text-ink-faint">
        →
      </span>
    </Link>
  );
}
