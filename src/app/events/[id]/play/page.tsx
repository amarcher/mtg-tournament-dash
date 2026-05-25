import Link from "next/link";
import { notFound } from "next/navigation";
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
} from "@/db/queries";
import { PlayClient } from "./PlayClient";
import { WaitForRound } from "./WaitForRound";
import { FinalRanking, type FinalRankingPlayer } from "../FinalRanking";

function EventContextLinks({
  leagueSlug,
  eventId,
}: {
  leagueSlug?: string;
  eventId: string;
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
  if (!me) {
    return (
      <main className="mx-auto max-w-md w-full px-6 py-12 text-center">
        <div className="mb-6 text-left">
          <EventContextLinks leagueSlug={league?.slug} eventId={id} />
        </div>
        <h1 className="text-2xl font-semibold">Not signed in</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Open the join link the organizer sent you. It looks like
          <code className="mx-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs">
            /events/{id}/join/…
          </code>
        </p>
      </main>
    );
  }

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
    return (
      <main className="mx-auto w-full max-w-md px-4 py-6">
        <div className="mb-4">
          <EventContextLinks leagueSlug={league?.slug} eventId={id} />
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
      </main>
    );
  }

  if (!match) {
    return (
      <main className="mx-auto max-w-md w-full px-6 py-12 text-center">
        <div className="mb-6 text-left">
          <EventContextLinks leagueSlug={league?.slug} eventId={id} />
        </div>
        <h1 className="text-2xl font-semibold">Hi {me.displayName}</h1>
        <p className="mt-3 text-zinc-400">
          No active match for you right now. This page will jump to your seat as
          soon as the organizer starts the next round.
        </p>
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
