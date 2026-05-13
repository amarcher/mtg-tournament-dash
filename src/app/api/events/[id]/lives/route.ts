import { eq, isNull, inArray, and } from "drizzle-orm";
import { db } from "@/db/client";
import { games, matches } from "@/db/schema";
import { getCurrentRound } from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-match life totals for the current round — the broadcast view's
 * belt-and-suspenders polling reconcile. If a `life_changed` event got
 * dropped across the 300s SSE reconnect cliff, the TV converges back to
 * truth within the next 10s tick.
 *
 * No auth — broadcast is a public read of public state (same data the
 * SSR'd /broadcast page already shows). Returns active-game ID so the
 * client can detect a game flip and fall through to a hard reload.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const round = await getCurrentRound(id);
  if (!round) return Response.json({ round: null, matches: [] });

  const roundMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.roundId, round.id));
  const matchIds = roundMatches.map((m) => m.id);
  if (matchIds.length === 0) {
    return Response.json({ round: { id: round.id, number: round.roundNumber }, matches: [] });
  }

  const activeGames = await db
    .select()
    .from(games)
    .where(and(inArray(games.matchId, matchIds), isNull(games.winnerId)));
  const lastGames = await db
    .select()
    .from(games)
    .where(inArray(games.matchId, matchIds))
    .orderBy(games.gameNumber);

  const activeByMatch = new Map(activeGames.map((g) => [g.matchId, g]));
  // lastGames is ordered ascending — last write wins on overwrite below.
  const lastByMatch = new Map<string, (typeof lastGames)[number]>();
  for (const g of lastGames) lastByMatch.set(g.matchId, g);

  const payload = roundMatches.map((m) => {
    const fallback = activeByMatch.get(m.id) ?? lastByMatch.get(m.id) ?? null;
    return {
      matchId: m.id,
      status: m.status,
      winnerId: m.winnerId,
      activeGameId: activeByMatch.get(m.id)?.id ?? null,
      life: {
        a: fallback?.playerALife ?? null,
        b: fallback?.playerBLife ?? null,
      },
    };
  });

  return Response.json({
    round: { id: round.id, number: round.roundNumber },
    matches: payload,
  });
}
