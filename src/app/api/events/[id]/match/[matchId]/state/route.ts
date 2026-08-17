import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { games, matches, rounds } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Match-state JSON for the phone view. Polled every few seconds as a
 * belt-and-suspenders fallback for SSE delivery — if one phone's `life_changed`
 * event misses the bus (cross-instance pubsub, dropped connection, whatever),
 * polling guarantees both sides converge to the server's value within a tick.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; matchId: string }> }
) {
  const { id, matchId } = await ctx.params;

  const me = await getCurrentPlayer(id);
  if (!me) {
    return new Response(JSON.stringify({ error: "not signed in" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) {
    return new Response(JSON.stringify({ error: "match not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  if (me.playerId !== match.playerAId && me.playerId !== match.playerBId) {
    return new Response(JSON.stringify({ error: "not your match" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const [round] = match.roundId
    ? await db.select().from(rounds).where(eq(rounds.id, match.roundId))
    : [undefined];
  if (!round || round.eventId !== id) {
    return new Response(JSON.stringify({ error: "match not in event" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.matchId, matchId))
    .orderBy(games.gameNumber);
  const [activeGame] = await db
    .select()
    .from(games)
    .where(and(eq(games.matchId, matchId), isNull(games.winnerId)))
    .orderBy(games.gameNumber)
    .limit(1);
  const fallbackGame = activeGame ?? allGames[allGames.length - 1] ?? null;

  const aWins = allGames.filter((g) => g.winnerId === match.playerAId).length;
  const bWins = match.playerBId
    ? allGames.filter((g) => g.winnerId === match.playerBId).length
    : 0;

  return Response.json({
    matchId: match.id,
    status: match.status,
    winnerId: match.winnerId,
    isDraw: match.isDraw,
    life: {
      a: fallbackGame?.playerALife ?? null,
      b: fallbackGame?.playerBLife ?? null,
    },
    wins: { a: aWins, b: bWins },
    activeGameId: activeGame?.id ?? null,
    gameNumber: fallbackGame?.gameNumber ?? null,
  });
}
