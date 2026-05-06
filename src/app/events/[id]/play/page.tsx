import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { games, players } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";
import { getActiveMatchForPlayer, getEvent } from "@/db/queries";
import { PlayClient } from "./PlayClient";

export const dynamic = "force-dynamic";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const me = await getCurrentPlayer(id);
  if (!me) {
    return (
      <main className="mx-auto max-w-md w-full px-6 py-20 text-center">
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
  if (!match) {
    return (
      <main className="mx-auto max-w-md w-full px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold">Hi {me.displayName}</h1>
        <p className="mt-3 text-zinc-400">
          No active match for you right now. Wait for the next round to start.
        </p>
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
      matchId={match.id}
      mySide={mySide}
      players={{ a, b }}
      initialGame={activeGame}
      initialWins={{ a: aWins, b: bWins }}
    />
  );
}
