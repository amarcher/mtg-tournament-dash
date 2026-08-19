import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { games, players } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";
import {
  getActiveMatchForPlayer,
  getEvent,
  getEventMatchHistory,
  getEventRoster,
  getEventStandings,
  getLeague,
  listOpenBonusGamesForEvent,
} from "@/db/queries";
import { findActiveBonusGameForPlayer } from "@/lib/bonus-game";
import { createBonusGameAction } from "@/app/events/actions";
import { PlayClient } from "./PlayClient";
import { WaitForRound } from "./WaitForRound";
import { FinalRanking, type FinalRankingPlayer } from "../FinalRanking";

function EventContextLinks({
  leagueSlug,
  eventId,
  playerId,
}: {
  leagueSlug?: string;
  eventId: string;
  playerId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {leagueSlug && (
        <Link
          href={`/leagues/${leagueSlug}`}
          className="rounded-md px-2 py-1 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          League
        </Link>
      )}
      {playerId && (
        <Link
          href={`/players/${playerId}`}
          className="rounded-md px-2 py-1 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          Edit portrait
        </Link>
      )}
      <Link
        href={`/events/${eventId}/claim?switch=1`}
        className="rounded-md px-2 py-1 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
      >
        Switch player
      </Link>
    </div>
  );
}

export const dynamic = "force-dynamic";

/**
 * Between-rounds (and after-event) bonus-game hub: return to your own open
 * game, join someone waiting for an opponent, or start a fresh one.
 */
function BonusGameSection({
  leagueSlug,
  eventId,
  myActiveMatchId,
  openGames,
  opponents,
}: {
  leagueSlug: string;
  eventId: string;
  myActiveMatchId: string | null;
  openGames: {
    matchId: string;
    playerAName: string;
    playerAAvatarUrl: string | null;
  }[];
  opponents: { playerId: string; displayName: string }[];
}) {
  return (
    <section className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-left">
      <h2 className="text-sm font-medium uppercase tracking-wide text-amber-300">
        Bonus Games
      </h2>
      {myActiveMatchId ? (
        <Link
          href={`/matches/${myActiveMatchId}`}
          className="mt-3 block w-full rounded-xl bg-amber-500 py-3 text-center font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          Return to your Bonus Game →
        </Link>
      ) : (
        <>
          {openGames.length > 0 && (
            <ul className="mt-3 space-y-2">
              {openGames.map((g) => (
                <li key={g.matchId}>
                  <Link
                    href={`/matches/${g.matchId}`}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 transition hover:border-emerald-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                  >
                    {g.playerAAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.playerAAvatarUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-amber-500/60 font-mono text-amber-400/80">
                        {g.playerAName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                      <strong>{g.playerAName}</strong> is looking for a game
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-emerald-400">
                      Join →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-400">
            Challenge a wizard directly and their phone jumps straight into
            the game — or open a seat and let anyone scan the QR. Games until
            you quit, no ELO on the line.
          </p>
          <form action={createBonusGameAction} className="mt-3 space-y-2">
            <input type="hidden" name="leagueSlug" value={leagueSlug} />
            <input type="hidden" name="eventId" value={eventId} />
            <label htmlFor="bonus-opponent" className="sr-only">
              Opponent
            </label>
            <select
              id="bonus-opponent"
              name="opponentId"
              defaultValue=""
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-base"
            >
              <option value="">Anyone — show a QR code</option>
              {opponents.map((o) => (
                <option key={o.playerId} value={o.playerId}>
                  {o.displayName}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label htmlFor="bonus-life" className="sr-only">
                Starting life
              </label>
              <select
                id="bonus-life"
                name="startingLife"
                defaultValue="20"
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-base"
              >
                <option value="20">20 life</option>
                <option value="40">40 life</option>
              </select>
              <button
                type="submit"
                className="flex-1 rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
              >
                Start a Bonus Game
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

async function loadBonusData(
  leagueId: string | undefined,
  eventId: string,
  playerId: string
) {
  if (!leagueId) {
    return {
      myActiveMatchId: null,
      openGames: [] as never[],
      opponents: [] as never[],
    };
  }
  const [mine, open, roster] = await Promise.all([
    findActiveBonusGameForPlayer(leagueId, playerId),
    listOpenBonusGamesForEvent(eventId),
    getEventRoster(eventId),
  ]);
  return {
    myActiveMatchId: mine?.id ?? null,
    openGames: open.filter((g) => g.playerAId !== playerId),
    opponents: roster
      .filter((r) => r.playerId !== playerId)
      .map((r) => ({ playerId: r.playerId, displayName: r.displayName })),
  };
}

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const league = await getLeague(event.leagueId);

  const me = await getCurrentPlayer(id);
  // No (or stale) event cookie — the claim page can recover every case: it
  // recognizes league-cookie holders for a one-tap continue and shows the
  // roster grid to everyone else. Never strand the player on a dead end.
  if (!me) redirect(`/events/${id}/claim`);

  const match = await getActiveMatchForPlayer(id, me.playerId);

  if (event.status === "complete") {
    const [standings, roster, history] = await Promise.all([
      getEventStandings(id),
      getEventRoster(id),
      getEventMatchHistory(id),
    ]);
    const startingEloById = new Map(
      roster.map((r) => [r.playerId, r.startingElo])
    );
    const ranking: FinalRankingPlayer[] = standings.map((s) => {
      const rows = history[s.playerId] ?? [];
      const eventDelta = rows.reduce(
        (acc, h) => acc + (h.eloDelta ?? 0),
        0
      );
      const startingElo = startingEloById.get(s.playerId) ?? s.currentElo;
      return {
        playerId: s.playerId,
        displayName: s.displayName,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        matchPoints: s.matchPoints,
        startingElo,
        endingElo: startingElo + eventDelta,
        eventEloDelta: eventDelta,
        avatars: {
          fresh: s.avatarUrl,
          wounded: s.avatarWoundedUrl,
          critical: s.avatarCriticalUrl,
          victory: s.avatarVictoryUrl,
          defeat: s.avatarDefeatUrl,
        },
        history: rows,
      };
    });
    const myRank =
      ranking.findIndex((r) => r.playerId === me.playerId) + 1;
    const bonus = await loadBonusData(league?.id, id, me.playerId);
    return (
      <main className="mx-auto w-full max-w-md px-4 py-6">
        <div className="mb-4">
          <EventContextLinks
            leagueSlug={league?.slug}
            eventId={id}
            playerId={me.playerId}
          />
        </div>
        <div className="mb-4 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
            Tournament complete
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{event.name}</h1>
          {myRank > 0 && (
            <p className="mt-1 text-sm text-zinc-400">
              You finished{" "}
              <strong className="text-amber-300">#{myRank}</strong> of{" "}
              {ranking.length}
            </p>
          )}
        </div>
        <FinalRanking
          players={ranking}
          highlightPlayerId={me.playerId}
        />
        {league && (
          <BonusGameSection
            leagueSlug={league.slug}
            eventId={id}
            myActiveMatchId={bonus.myActiveMatchId}
            openGames={bonus.openGames}
            opponents={bonus.opponents}
          />
        )}
        <WaitForRound eventId={id} />
      </main>
    );
  }

  // A complete match must never mount PlayClient: its poll sees
  // status "complete" and reloads, which re-renders the same complete match —
  // an infinite reload loop. Show the waiting room with the result instead.
  if (!match || match.status === "complete") {
    let resultLine: string | null = null;
    if (match && match.status === "complete") {
      const oppId =
        match.playerAId === me.playerId ? match.playerBId : match.playerAId;
      const opp = oppId
        ? (
            await db.select().from(players).where(eq(players.id, oppId))
          )[0]
        : null;
      const oppName = opp?.displayName ?? "your opponent";
      resultLine = !oppId
        ? "You had a bye this round."
        : match.isDraw
          ? `Your match against ${oppName} was a draw.`
          : match.winnerId === me.playerId
            ? `You won your match against ${oppName}!`
            : `You lost your match against ${oppName}.`;
    }
    const bonus = await loadBonusData(league?.id, id, me.playerId);
    return (
      <main className="mx-auto max-w-md w-full px-6 py-12 text-center">
        <div className="mb-6 text-left">
          <EventContextLinks
            leagueSlug={league?.slug}
            eventId={id}
            playerId={me.playerId}
          />
        </div>
        <h1 className="text-2xl font-semibold">Hi {me.displayName}</h1>
        {resultLine && (
          <p className="mt-3 font-medium text-amber-300">{resultLine}</p>
        )}
        <p className="mt-3 text-zinc-400">
          {me.droppedAt
            ? "You've dropped from this event — everything you finished still counts in the standings. Up for a bonus game while the others play?"
            : match
              ? "Hang tight while the other tables finish — this page will jump to your next pairing automatically."
              : "No active match for you right now. This page will jump to your seat as soon as the organizer starts the next round."}
        </p>
        {league && (
          <BonusGameSection
            leagueSlug={league.slug}
            eventId={id}
            myActiveMatchId={bonus.myActiveMatchId}
            openGames={bonus.openGames}
            opponents={bonus.opponents}
          />
        )}
        <WaitForRound eventId={id} />
      </main>
    );
  }

  // Pull both player names + the active game.
  const [a] = await db
    .select()
    .from(players)
    .where(eq(players.id, match.playerAId));
  const b = match.playerBId
    ? (
        await db.select().from(players).where(eq(players.id, match.playerBId))
      )[0]
    : null;

  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.matchId, match.id))
    .orderBy(games.gameNumber);
  const activeGame =
    allGames.find((g) => g.winnerId === null) ?? allGames[allGames.length - 1];

  const aWins = allGames.filter((g) => g.winnerId === a.id).length;
  const bWins = b
    ? allGames.filter((g) => g.winnerId === b.id).length
    : 0;

  // Figure out which side I am.
  const mySide: "a" | "b" = me.playerId === match.playerAId ? "a" : "b";

  return (
    <PlayClient
      eventId={id}
      eventName={event.name}
      leagueSlug={league?.slug ?? null}
      tableNumber={match.tableNumber}
      matchId={match.id}
      mySide={mySide}
      players={{ a, b }}
      startingLife={event.startingLife}
      initialGame={activeGame}
      initialWins={{ a: aWins, b: bWins }}
    />
  );
}
