import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { eloChanges, events, games, matches, players, rounds } from "@/db/schema";
import { computeMatchElo } from "@/lib/elo";
import { publish, publishToChannel } from "@/lib/pubsub";
import { channelForMatch } from "@/lib/realtime-schema";
import { checkLifeWrite, type LifeWriteRejection } from "@/lib/life-write";

/**
 * Domain mutations for an in-progress match. These do NOT authorize the
 * caller — the `*Action` wrappers in actions.ts do that (request-scoped, via
 * cookies) before delegating here. Keeping the core separate lets trusted
 * server-side callers (e.g. the `verify` end-to-end harness, which has no
 * request/cookie scope) exercise the same logic without a participant cookie.
 */

export type LifeAdjustResult =
  | { ok: true; life: number }
  | { ok: false; reason: LifeWriteRejection; life: number | null };

/**
 * Compare-and-set life write. Applies `delta` only if the active game and its
 * current life still match what the client computed against (`gameId` +
 * `expectedLife`); otherwise returns the authoritative value so the caller can
 * resync. This closes both the stale-cross-game write and the
 * duplicated/retried (double-apply) write.
 */
export async function applyLifeAdjust(args: {
  matchId: string;
  side: "a" | "b";
  delta: number;
  gameId: string;
  expectedLife: number;
}): Promise<LifeAdjustResult> {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, args.matchId));
  if (!match || match.status !== "in_progress")
    throw new Error("Match not in progress");

  // Bonus games (roundId null) have no round/event — their live updates fan
  // out on the per-match channel instead.
  const [round] = match.roundId
    ? await db.select().from(rounds).where(eq(rounds.id, match.roundId))
    : [undefined];

  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.matchId, args.matchId), isNull(games.winnerId)))
    .orderBy(games.gameNumber)
    .limit(1);

  const storedLife = game
    ? args.side === "a"
      ? game.playerALife
      : game.playerBLife
    : null;

  const decision = checkLifeWrite(
    { activeGameId: game?.id ?? null, storedLife },
    { gameId: args.gameId, expectedLife: args.expectedLife }
  );
  if (!decision.ok) {
    return { ok: false, reason: decision.reason, life: storedLife };
  }

  const next = (storedLife as number) + args.delta;

  await db
    .update(games)
    .set(args.side === "a" ? { playerALife: next } : { playerBLife: next })
    .where(eq(games.id, game!.id));

  const lifeChanged = {
    type: "life_changed" as const,
    matchId: args.matchId,
    gameId: game!.id,
    side: args.side,
    life: next,
  };
  if (round) await publish(round.eventId, lifeChanged);
  else await publishToChannel(channelForMatch(match.id), lifeChanged);

  return { ok: true, life: next };
}

/**
 * Record a game winner, advance to the next game, or finalize the match (and
 * update ELO) once a side reaches two game wins. Idempotent on late/duplicate
 * calls: no-ops if the match is already complete or there's no open game.
 */
export async function applyGameWinner(args: {
  matchId: string;
  winnerId: string;
  /**
   * The game the client believed it was reporting. When provided (the phone
   * UI always does), the report is dropped unless it targets the currently
   * open game — a backgrounded tab that missed a game flip must not decide
   * the next game. Trusted server-side callers may omit it.
   */
  gameId?: string;
}): Promise<void> {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, args.matchId));
  if (!match) throw new Error("Match not found");
  // Touch UIs double-fire all the time; swallow late calls instead of
  // crashing the player view. The first call already produced the state the
  // user intended.
  if (match.status === "complete") return;
  if (args.winnerId !== match.playerAId && args.winnerId !== match.playerBId)
    throw new Error("Winner must be a participant in this match");

  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.matchId, args.matchId), isNull(games.winnerId)))
    .orderBy(games.gameNumber)
    .limit(1);
  // Same idempotency reasoning — if there's no open game, no-op.
  if (!game) return;
  if (args.gameId && game.id !== args.gameId) return;

  await db
    .update(games)
    .set({ winnerId: args.winnerId, completedAt: new Date() })
    .where(eq(games.id, game.id));

  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.matchId, args.matchId));
  // Bonus game: no best-of-3, no ELO, no auto-completion — deal the next
  // game and keep the tally running until someone taps "End Bonus Game".
  if (!match.roundId) {
    const nextGameNumber = allGames.length + 1;
    const startingLife = match.startingLife ?? 20;
    const [newGame] = await db
      .insert(games)
      .values({
        matchId: match.id,
        gameNumber: nextGameNumber,
        playerALife: startingLife,
        playerBLife: startingLife,
      })
      .returning();
    await publishToChannel(channelForMatch(match.id), {
      type: "game_complete",
      matchId: match.id,
      winnerId: args.winnerId,
      nextGameNumber,
      newGameId: newGame.id,
    });
    return;
  }

  const aWins = allGames.filter((g) => g.winnerId === match.playerAId).length;
  const bWins = allGames.filter((g) => g.winnerId === match.playerBId).length;

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, match.roundId));
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, round.eventId));

  if (aWins >= 2 || bWins >= 2) {
    const winnerId = aWins >= 2 ? match.playerAId : match.playerBId!;
    await db
      .update(matches)
      .set({ status: "complete", winnerId, completedAt: new Date() })
      .where(eq(matches.id, match.id));

    if (match.playerBId) {
      const [a] = await db
        .select()
        .from(players)
        .where(eq(players.id, match.playerAId));
      const [b] = await db
        .select()
        .from(players)
        .where(eq(players.id, match.playerBId));
      const elo = computeMatchElo({
        playerAId: a.id,
        playerARating: a.currentElo,
        playerBId: b.id,
        playerBRating: b.currentElo,
        winnerId,
      });
      await db.insert(eloChanges).values([
        {
          matchId: match.id,
          playerId: a.id,
          before: elo.playerA.before,
          after: elo.playerA.after,
          delta: elo.playerA.delta,
        },
        {
          matchId: match.id,
          playerId: b.id,
          before: elo.playerB.before,
          after: elo.playerB.after,
          delta: elo.playerB.delta,
        },
      ]);
      await db
        .update(players)
        .set({ currentElo: elo.playerA.after })
        .where(eq(players.id, a.id));
      await db
        .update(players)
        .set({ currentElo: elo.playerB.after })
        .where(eq(players.id, b.id));
    }
    await publish(event.id, {
      type: "match_complete",
      matchId: match.id,
      winnerId,
    });
  } else {
    const nextGameNumber = allGames.length + 1;
    const [newGame] = await db
      .insert(games)
      .values({
        matchId: match.id,
        gameNumber: nextGameNumber,
        playerALife: event.startingLife,
        playerBLife: event.startingLife,
      })
      .returning();
    await publish(event.id, {
      type: "game_complete",
      matchId: match.id,
      winnerId: args.winnerId,
      nextGameNumber,
      newGameId: newGame.id,
    });
  }
}
