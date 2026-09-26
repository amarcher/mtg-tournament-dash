import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  getPollDetail,
  listLeaguePlayers,
  listOpenBonusGamesForLeague,
  listOpenEventsForPlayer,
  listOpenLeagueEvents,
  listOpenLeaguePolls,
  listUpcomingNights,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { getOrganizerView } from "@/lib/organizer-mode";
import {
  findActiveBonusGameForPlayer,
  listBusyBonusPlayerIds,
} from "@/lib/bonus-game";
import { BonusGameForm } from "@/app/components/BonusGameForm";
import { AppChrome } from "@/app/components/AppChrome";
import { NightPlanLine, RsvpButtons } from "@/app/components/GameNightCard";
import { formatPollDate } from "@/lib/schedule-types";

export const dynamic = "force-dynamic";

/**
 * The Play tab — a player's home. Ordered by what a player came to do: the
 * live match first, then bonus games, then anything on the schedule still
 * waiting on their answer. Standings and history live on the League tab;
 * organizer tools live behind organizer mode.
 */
export default async function PlayHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [players, openEvents, me, openPolls, upcomingNights, view] =
    await Promise.all([
      listLeaguePlayers(league.id),
      listOpenLeagueEvents(league.id),
      getCurrentLeaguePlayer(league.id),
      listOpenLeaguePolls(league.id),
      listUpcomingNights(league.id, 6),
      getOrganizerView(league),
    ]);

  const [myOpenEvents, myBonusGame, busyBonusIds, openSeats, pollDetails] =
    await Promise.all([
      me ? listOpenEventsForPlayer(league.id, me.id) : Promise.resolve([]),
      me
        ? findActiveBonusGameForPlayer(league.id, me.id)
        : Promise.resolve(null),
      me ? listBusyBonusPlayerIds(league.id) : Promise.resolve(new Set<string>()),
      listOpenBonusGamesForLeague(league.id),
      Promise.all(openPolls.map((p) => getPollDetail(p.id))),
    ]);

  const myEventIds = new Set(myOpenEvents.map(({ event }) => event.id));
  const otherEvents = openEvents.filter((e) => !myEventIds.has(e.id));
  const seatsForMe = openSeats.filter((g) => g.playerAId !== me?.id);

  const pollsToAnswer = me
    ? openPolls.filter(
        (_, i) =>
          !pollDetails[i].some((o) => o.votes.some((v) => v.playerId === me.id))
      )
    : [];
  const nightsToAnswer = me
    ? upcomingNights
        .filter(
          (n) =>
            n.status !== "canceled" &&
            !n.rsvps.some((r) => r.playerId === me.id)
        )
        .slice(0, 3)
    : [];
  const answeredCount = me
    ? openPolls.length - pollsToAnswer.length
    : 0;

  return (
    <AppChrome
      league={league}
      player={me}
      isOrganizer={view.isOrganizer}
      organizerMode={view.organizerMode}
      active="play"
    >
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <h1 className="text-2xl font-bold">
          {me ? `Hi, ${me.displayName}` : league.name}
        </h1>

        {!me && (
          <Link
            href={`/leagues/${league.slug}/claim`}
            className="block rounded-panel border border-line-strong bg-[linear-gradient(135deg,rgb(255_215_106/0.18),rgb(255_160_60/0.05)_60%)] p-5 transition hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            <div className="label-caps text-gold">Start here</div>
            <div className="mt-2 font-display text-lg font-bold">
              Claim your wizard
            </div>
            <p className="mt-1 text-sm text-ink-dim">
              Pick your name from the league (or make a new wizard) so this
              phone knows who you are. You only do this once.
            </p>
            <span className="mt-4 inline-flex rounded-[12px] px-4 py-2.5 text-sm btn-gold">
              Claim wizard →
            </span>
          </Link>
        )}

        {myOpenEvents.map(({ event, activeMatch }) => (
          <Link
            key={event.id}
            href={`/events/${event.id}/play`}
            className="block rounded-panel border border-line-strong bg-[linear-gradient(135deg,rgb(255_215_106/0.20),rgb(255_160_60/0.05)_60%)] p-5 shadow-e2 transition hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            <div className="label-caps text-gold">
              {activeMatch
                ? `Your match is live · Table ${activeMatch.tableNumber}`
                : "You're on the roster"}
            </div>
            <div className="mt-2 font-display text-xl font-bold">
              {event.name}
            </div>
            <p className="mt-1 text-sm text-ink-dim">
              {activeMatch
                ? "Tap to keep score."
                : "Stand by here. The scorekeeper opens when the round starts."}
            </p>
            <span className="mt-4 inline-flex rounded-[12px] px-5 py-3 text-sm btn-gold">
              {activeMatch ? "Keep score →" : "Stand by →"}
            </span>
          </Link>
        ))}

        {me && (
          <section className="surface-card p-4" aria-labelledby="bonus-h">
            <h2 id="bonus-h" className="label-caps text-ink-dim">
              Bonus games
            </h2>
            {myBonusGame ? (
              <Link
                href={`/matches/${myBonusGame.id}`}
                className="mt-3 flex items-center justify-between gap-3 rounded-[14px] border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 transition hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
              >
                <span className="font-semibold text-emerald-100">
                  {myBonusGame.status === "pending"
                    ? "Your seat is open — waiting for an opponent"
                    : "Your bonus game is in progress"}
                </span>
                <span className="shrink-0 text-sm font-semibold text-emerald-300">
                  Resume →
                </span>
              </Link>
            ) : (
              <>
                {seatsForMe.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {seatsForMe.map((g) => (
                      <li key={g.matchId}>
                        <Link
                          href={`/matches/${g.matchId}`}
                          className="flex items-center gap-3 rounded-[14px] border border-line bg-white/[0.03] px-3 py-2.5 transition hover:border-emerald-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                        >
                          <SmallAvatar
                            name={g.playerAName}
                            url={g.playerAAvatarUrl}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            <strong className="font-semibold">
                              {g.playerAName}
                            </strong>{" "}
                            <span className="text-ink-dim">
                              is looking for a game
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-emerald-300">
                            Join →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-sm text-ink-dim">
                  Challenge anyone in the league, or open a seat and let
                  someone scan in. Games until you quit, no ELO on the line.
                </p>
                <BonusGameForm
                  leagueSlug={league.slug}
                  opponents={players
                    .filter((p) => p.id !== me.id)
                    .map((p) => ({
                      playerId: p.id,
                      displayName: p.displayName,
                      busy: busyBonusIds.has(p.id),
                    }))}
                  idPrefix="league-bonus"
                />
              </>
            )}
          </section>
        )}

        {me && (pollsToAnswer.length > 0 || nightsToAnswer.length > 0) && (
          <section className="surface-card p-4" aria-labelledby="answer-h">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="answer-h" className="label-caps text-gold">
                Needs your answer
              </h2>
              <Link
                href={`/leagues/${league.slug}/schedule`}
                className="text-sm font-medium text-ink-dim transition hover:text-ink"
              >
                Schedule →
              </Link>
            </div>
            <ul className="mt-2 divide-y divide-white/5">
              {pollsToAnswer.map((poll) => (
                <li key={poll.id} className="py-3">
                  <Link
                    href={`/leagues/${league.slug}/schedule/${poll.id}`}
                    className="flex items-center justify-between gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {poll.title}
                      </span>
                      <span className="text-sm text-ink-dim">
                        Pick the dates that work for you
                      </span>
                    </span>
                    <span className="shrink-0 rounded-[12px] px-4 py-2.5 text-sm btn-gold">
                      Vote
                    </span>
                  </Link>
                </li>
              ))}
              {nightsToAnswer.map((night) => (
                <li key={night.id} className="flex flex-col gap-2 py-3">
                  <Link
                    href={`/leagues/${league.slug}/schedule/nights/${night.id}`}
                    className="font-semibold transition hover:text-gold"
                  >
                    {formatPollDate(night.startsAt)}
                  </Link>
                  <NightPlanLine night={night} />
                  <RsvpButtons nightId={night.id} playerId={me.id} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {me &&
          pollsToAnswer.length === 0 &&
          nightsToAnswer.length === 0 &&
          (answeredCount > 0 || upcomingNights.length > 0) && (
            <p className="text-center text-sm text-ink-faint">
              You&apos;re all caught up on the schedule.
            </p>
          )}

        {otherEvents.length > 0 && (
          <section aria-labelledby="events-h" className="flex flex-col gap-2">
            <h2 id="events-h" className="label-caps text-ink-dim">
              Also running
            </h2>
            {otherEvents.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 surface-card px-4 py-3"
              >
                <span className="min-w-0 truncate font-semibold">{e.name}</span>
                <span className="flex shrink-0 gap-2">
                  <Link
                    href={`/events/${e.id}/broadcast`}
                    className="rounded-[12px] px-3 py-2 text-sm btn-ghost"
                  >
                    Watch
                  </Link>
                  {(e.status === "draft" || !me) && (
                    <Link
                      href={`/events/${e.id}/claim`}
                      className="rounded-[12px] px-3 py-2 text-sm btn-gold"
                    >
                      {me ? "Join" : "Claim seat"}
                    </Link>
                  )}
                </span>
              </div>
            ))}
          </section>
        )}
      </main>
    </AppChrome>
  );
}

function SmallAvatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line-strong"
    />
  ) : (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-sm font-bold text-gold ring-1 ring-line-strong">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
