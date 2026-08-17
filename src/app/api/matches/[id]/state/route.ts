import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { games, matches } from "@/db/schema";
import { getBonusGameCallerId } from "@/lib/bonus-game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bonus-game state JSON for the phone view — the polling counterpart of the
 * event-scoped match state route, with the same belt-and-suspenders role:
 * if a life_changed event misses the SSE bus, both phones converge on the
 * server's value within a tick.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const [match] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.id, id), isNull(matches.roundId)));
  if (!match) {
    return Response.json({ error: "bonus game not found" }, { status: 404 });
  }

  const callerId = await getBonusGameCallerId(match);
  if (!callerId) {
    return Response.json({ error: "not signed in" }, { status: 401 });
  }
  if (callerId !== match.playerAId && callerId !== match.playerBId) {
    return Response.json({ error: "not your match" }, { status: 403 });
  }

  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.matchId, match.id))
    .orderBy(games.gameNumber);
  const activeGame = allGames.find((g) => g.winnerId === null) ?? null;
  const fallbackGame = activeGame ?? allGames[allGames.length - 1] ?? null;

  const aWins = allGames.filter((g) => g.winnerId === match.playerAId).length;
  const bWins = match.playerBId
    ? allGames.filter((g) => g.winnerId === match.playerBId).length
    : 0;

  return Response.json({
    matchId: match.id,
    status: match.status,
    life: {
      a: fallbackGame?.playerALife ?? null,
      b: fallbackGame?.playerBLife ?? null,
    },
    wins: { a: aWins, b: bWins },
    activeGameId: activeGame?.id ?? null,
    gameNumber: fallbackGame?.gameNumber ?? null,
  });
}
