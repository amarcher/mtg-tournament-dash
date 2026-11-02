import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  listCompletedLeagueEvents,
  listLeagueMessages,
  listLeaguePlayers,
  listOpenLeagueEvents,
  listOpenLeaguePolls,
  listUpcomingNights,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { getOrganizerView } from "@/lib/organizer-mode";
import { countMessageReach } from "@/lib/push-devices";
import { formatPollDate, LEAGUE_TIMEZONE } from "@/lib/schedule-types";
import { AppChrome } from "@/app/components/AppChrome";
import { OrganizerGate } from "@/app/components/OrganizerGate";
import { MessageComposer, type DestinationOption } from "./MessageComposer";

export const dynamic = "force-dynamic";

/**
 * The organizer's one-off note: a title, two lines, and one of the league's
 * own pages for the tap to land on. Reach is shown up front because a
 * league where nobody has the app yet would otherwise send into silence.
 */
export default async function NotifyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [view, me] = await Promise.all([
    getOrganizerView(league),
    getCurrentLeaguePlayer(league.id),
  ]);
  if (!view.isOrganizer) {
    return (
      <OrganizerGate league={league} next={`/leagues/${league.slug}/organize/notify`} />
    );
  }

  const [reach, roster, recent, nights, polls, finished, open] =
    await Promise.all([
      countMessageReach(league.id),
      listLeaguePlayers(league.id),
      listLeagueMessages(league.id, 5),
      listUpcomingNights(league.id, 5),
      listOpenLeaguePolls(league.id),
      listCompletedLeagueEvents(league.id, 5),
      listOpenLeagueEvents(league.id),
    ]);

  const options: DestinationOption[] = [
    { key: "home", label: "League home", group: "Pages" },
    { key: "schedule", label: "Schedule", group: "Pages" },
    { key: "standings", label: "Standings", group: "Pages" },
    ...nights.map((n) => ({
      key: `night:${n.id}`,
      label: formatPollDate(n.startsAt),
      group: "Game nights",
    })),
    ...polls.map((p) => ({ key: `poll:${p.id}`, label: p.title, group: "Open polls" })),
    ...open.map((e) => ({ key: `event:${e.id}`, label: e.name, group: "Events" })),
    ...finished.map((e) => ({ key: `event:${e.id}`, label: e.name, group: "Results" })),
  ];
  const presetTargets = {
    next_night: nights[0] ? `night:${nights[0].id}` : "schedule",
    latest_poll: polls[0] ? `poll:${polls[0].id}` : "schedule",
    latest_event: finished[0] ? `event:${finished[0].id}` : "standings",
    schedule: "schedule",
    standings: "standings",
  };
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
        <div>
          <Link href={`${base}/organize`} className="text-sm text-ink-dim hover:text-ink">
            ← Organize
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Send a note</h1>
          <p className="mt-1 text-sm text-ink-dim">
            A one-off push to every phone in {league.name} with the app:
            a reminder to RSVP, results are in, bring the good snacks.
          </p>
        </div>

        <MessageComposer
          leagueId={league.id}
          options={options}
          presetTargets={presetTargets}
          reach={{ ...reach, roster: roster.length }}
        />

        <section aria-labelledby="recent-h" className="flex flex-col gap-2">
          <h2 id="recent-h" className="label-caps text-ink-dim">
            Recent notes
          </h2>
          {recent.length === 0 ? (
            <p className="surface-card p-4 text-sm text-ink-dim">
              Nothing sent yet.
            </p>
          ) : (
            <ul className="surface-card divide-y divide-white/5">
              {recent.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold">{m.title}</span>
                    <span className="text-xs text-ink-faint">
                      {new Date(m.sentAt).toLocaleString("en-US", {
                        timeZone: LEAGUE_TIMEZONE,
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-dim">{m.body}</p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {m.sentCount} {m.sentCount === 1 ? "phone" : "phones"}
                    {m.optedOutCount > 0 && ` · ${m.optedOutCount} switched off`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppChrome>
  );
}
