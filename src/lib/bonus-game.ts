import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { games, matches, players, type Match } from "@/db/schema";
import { publishToChannel } from "@/lib/pubsub";
import { channelForEvent, channelForMatch } from "@/lib/realtime-schema";
import { getCurrentLeaguePlayer, getCurrentPlayer } from "@/lib/auth";

/**
 * Lifecycle for bonus games — casual head-to-head matches outside any round
 * (matches.roundId null). Like match-mutations.ts, these do NOT authorize the
 * caller; the `*Action` wrappers in actions.ts do that before delegating, and
 * the verify harness drives these directly without a request scope.
 */

export const BONUS_LIFE_CHOICES = [20, 40] as const;

/**
 * Bonus games are a same-evening thing. One left in_progress by players who
 * wandered off must not block either of them from being challenged the next
 * day (the Aug 31 draft night: a single abandoned game made two players
 * un-challengeable all night). Games older than this stop counting as
 * "active" everywhere — busy checks, "return to your game" — though their
 * match page still works if someone reopens it.
 */
const ACTIVE_WINDOW_HOURS = 12;

function activeWindowCutoff(): Date {
  return new Date(Date.now() - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000);
}

/**
 * Which league player this device is, within a bonus game's scope. Identity
 * is the durable league cookie, with the event cookie as a fallback for
 * players who only ever joined via a per-event deep link. Request-scoped —
 * actions and API routes use this; the verify harness never calls it.
 */
export async function getBonusGameCallerId(
  match: Match
): Promise<string | undefined> {
  const leaguePlayer = match.leagueId
    ? await getCurrentLeaguePlayer(match.leagueId)
    : null;
  if (leaguePlayer) return leaguePlayer.id;
  if (match.eventId) {
    const ep = await getCurrentPlayer(match.eventId);
    return ep?.playerId;
  }
  return undefined;
}

function normalizeStartingLife(life: number | undefined): number {
  if (!life || !Number.isFinite(life)) return 20;
  return Math.min(999, Math.max(1, Math.round(life)));
}

/** Open (pending or in-progress) bonus game this player is part of, if any. */
export async function findActiveBonusGameForPlayer(
  leagueId: string,
  playerId: string
): Promise<Match | null> {
  const [row] = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.leagueId, leagueId),
        isNull(matches.roundId),
        ne(matches.status, "complete"),
        gte(matches.createdAt, activeWindowCutoff()),
        sql`(${matches.playerAId} = ${playerId} OR ${matches.playerBId} = ${playerId})`
      )
    )
    .orderBy(desc(matches.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Players currently tied up in an open bonus game — the challenge dropdowns
 * mark them so nobody hits "X is already in a bonus game" as a raw error.
 */
export async function listBusyBonusPlayerIds(
  leagueId: string
): Promise<Set<string>> {
  const rows = await db
    .select({ a: matches.playerAId, b: matches.playerBId })
    .from(matches)
    .where(
      and(
        eq(matches.leagueId, leagueId),
        isNull(matches.roundId),
        ne(matches.status, "complete"),
        gte(matches.createdAt, activeWindowCutoff())
      )
    );
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.a);
    if (r.b) ids.add(r.b);
  }
  return ids;
}

/**
 * Open a bonus game with the caller in seat A. With no opponent chosen, seat
 * B stays empty and the match page shows a QR until someone claims it. With
 * `playerBId`, the challenged wizard is seated immediately and the game
 * starts in progress — no scan needed. If the caller already has an open
 * bonus game, return that instead of stacking a second one.
 */
export async function createBonusGame(args: {
  leagueId: string;
  playerAId: string;
  playerBId?: string | null;
  eventId?: string | null;
  startingLife?: number;
}): Promise<Match> {
  const existing = await findActiveBonusGameForPlayer(
    args.leagueId,
    args.playerAId
  );
  if (existing) return existing;

  const playerBId = args.playerBId || null;
  if (playerBId) {
    if (playerBId === args.playerAId)
      throw new Error("Pick someone else — you can't battle yourself");
    const [opponent] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerBId));
    if (!opponent || opponent.leagueId !== args.leagueId)
      throw new Error("Bonus games pair wizards from the same league");
    const theirGame = await findActiveBonusGameForPlayer(
      args.leagueId,
      playerBId
    );
    if (theirGame)
      throw new Error(
        `${opponent.displayName} is already in a bonus game`
      );
  }

  const startingLife = normalizeStartingLife(args.startingLife);
  const [match] = await db
    .insert(matches)
    .values({
      roundId: null,
      leagueId: args.leagueId,
      eventId: args.eventId ?? null,
      tableNumber: 0,
      playerAId: args.playerAId,
      playerBId,
      status: playerBId ? "in_progress" : "pending",
      startingLife,
    })
    .returning();

  if (playerBId) {
    await db.insert(games).values({
      matchId: match.id,
      gameNumber: 1,
      playerALife: startingLife,
      playerBLife: startingLife,
    });
    await publishToChannel(channelForMatch(match.id), {
      type: "bonus_game_started",
      matchId: match.id,
    });
  }
  if (match.eventId) {
    await publishToChannel(channelForEvent(match.eventId), {
      type: playerBId ? "bonus_game_started" : "bonus_game_opened",
      matchId: match.id,
    });
  }
  return match;
}

/** Claim the open B seat, deal game 1, and flip both phones into play. */
export async function joinBonusGame(args: {
  matchId: string;
  playerBId: string;
}): Promise<Match> {
  const [match] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.id, args.matchId), isNull(matches.roundId)));
  if (!match) throw new Error("Bonus game not found");
  if (match.status !== "pending" || match.playerBId)
    throw new Error("This bonus game already has both players");
  if (match.playerAId === args.playerBId)
    throw new Error("You created this bonus game — wait for an opponent");

  const [opponent] = await db
    .select()
    .from(players)
    .where(eq(players.id, args.playerBId));
  if (!opponent || opponent.leagueId !== match.leagueId)
    throw new Error("Bonus games pair wizards from the same league");

  // Conditional update so two simultaneous scans can't both claim the seat.
  const [claimed] = await db
    .update(matches)
    .set({ playerBId: args.playerBId, status: "in_progress" })
    .where(
      and(
        eq(matches.id, match.id),
        isNull(matches.playerBId),
        eq(matches.status, "pending")
      )
    )
    .returning();
  if (!claimed) throw new Error("Someone else just joined this bonus game");

  const startingLife = claimed.startingLife ?? 20;
  await db.insert(games).values({
    matchId: claimed.id,
    gameNumber: 1,
    playerALife: startingLife,
    playerBLife: startingLife,
  });

  await publishToChannel(channelForMatch(claimed.id), {
    type: "bonus_game_started",
    matchId: claimed.id,
  });
  if (claimed.eventId) {
    await publishToChannel(channelForEvent(claimed.eventId), {
      type: "bonus_game_started",
      matchId: claimed.id,
    });
  }
  return claimed;
}

/**
 * End a bonus game — the "End Bonus Game" button, and also how a creator
 * cancels one nobody joined. No winner, no ELO; the tally is the record.
 */
export async function endBonusGame(args: { matchId: string }): Promise<void> {
  const [match] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.id, args.matchId), isNull(matches.roundId)));
  if (!match) throw new Error("Bonus game not found");
  if (match.status === "complete") return;

  await db
    .update(matches)
    .set({ status: "complete", completedAt: new Date() })
    .where(eq(matches.id, match.id));

  await publishToChannel(channelForMatch(match.id), {
    type: "bonus_game_ended",
    matchId: match.id,
  });
  if (match.eventId) {
    await publishToChannel(channelForEvent(match.eventId), {
      type: "bonus_game_ended",
      matchId: match.id,
    });
  }
}

/**
 * "Bonus Game" from the final screen: spin up a fresh match with the same
 * pair, already in progress. Publishes bonus_game_started on the *old*
 * match's channel carrying the new matchId, so both phones follow along.
 */
export async function startAnotherBonusGame(args: {
  matchId: string;
}): Promise<Match> {
  const [old] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.id, args.matchId), isNull(matches.roundId)));
  if (!old) throw new Error("Bonus game not found");
  if (old.status !== "complete" || !old.playerBId)
    throw new Error("Finish this bonus game first");

  // Both phones offer the button — if the other side already tapped it,
  // follow them into that match instead of creating a duplicate.
  const existing = await findActiveBonusGameForPlayer(
    old.leagueId!,
    old.playerAId
  );
  if (existing) return existing;

  const startingLife = old.startingLife ?? 20;
  const [next] = await db
    .insert(matches)
    .values({
      roundId: null,
      leagueId: old.leagueId,
      eventId: old.eventId,
      tableNumber: 0,
      playerAId: old.playerAId,
      playerBId: old.playerBId,
      status: "in_progress",
      startingLife,
    })
    .returning();
  await db.insert(games).values({
    matchId: next.id,
    gameNumber: 1,
    playerALife: startingLife,
    playerBLife: startingLife,
  });

  await publishToChannel(channelForMatch(old.id), {
    type: "bonus_game_started",
    matchId: next.id,
  });
  return next;
}
