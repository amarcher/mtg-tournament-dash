import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventPlayers, events, games, matches, players, rounds } from "@/db/schema";
import { generateJoinToken } from "@/lib/auth";
import { publish } from "@/lib/pubsub";

/**
 * Domain core for walk-up self-joins: add a league player to an event's
 * roster. Deliberately un-authorized — `joinEventAction` wraps it with the
 * league-cookie check (and only ever passes the caller's own playerId), while
 * the verify harness drives it directly. Mirrors the match-mutations.ts split.
 *
 * Only draft events accept joins: once rounds exist, the roster is Swiss
 * state and belongs to the organizer's tools. Idempotent — re-joining
 * returns the existing seat.
 */
export async function addPlayerToEventRoster({
  eventId,
  playerId,
  organizerOverride = false,
}: {
  eventId: string;
  playerId: string;
  /**
   * Organizer tooling may amend an already-started event's roster: late
   * arrivals slot into the next round's pairings with no history. Walk-up
   * self-joins never set this.
   */
  organizerOverride?: boolean;
}): Promise<{ joinToken: string; alreadyJoined: boolean }> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");
  if (event.status === "complete")
    throw new Error("This event is over — the roster is history now");

  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));
  if (!player || player.leagueId !== event.leagueId) {
    throw new Error("Player is not in this event's league");
  }

  const [existing] = await db
    .select()
    .from(eventPlayers)
    .where(
      and(
        eq(eventPlayers.eventId, eventId),
        eq(eventPlayers.playerId, playerId)
      )
    )
    .limit(1);
  if (existing) {
    // Re-adding a dropped player reinstates them: their record stayed in
    // the standings all along, and they rejoin the next round's pairings.
    if (existing.droppedAt) {
      await db
        .update(eventPlayers)
        .set({ droppedAt: null })
        .where(
          and(
            eq(eventPlayers.eventId, eventId),
            eq(eventPlayers.playerId, playerId)
          )
        );
    }
    return { joinToken: existing.joinToken, alreadyJoined: true };
  }

  if (event.status !== "draft" && !organizerOverride) {
    throw new Error(
      "This event has already started — ask the organizer to add you."
    );
  }

  const roster = await db
    .select({ seed: eventPlayers.seed })
    .from(eventPlayers)
    .where(eq(eventPlayers.eventId, eventId));
  const nextSeed = roster.reduce((max, r) => Math.max(max, r.seed), 0) + 1;

  const joinToken = generateJoinToken();
  await db.insert(eventPlayers).values({
    eventId,
    playerId,
    seed: nextSeed,
    startingElo: player.currentElo,
    joinToken,
  });
  return { joinToken, alreadyJoined: false };
}

export type RemoveRosterResult =
  | { mode: "removed" }
  | { mode: "dropped"; byesGranted: number };

/**
 * Take a player off an event's roster. Domain core — the organizer-gated
 * action wraps it; the verify harness drives it directly.
 *
 * - Draft event: they were never part of it — delete the seat outright.
 * - Active event: mark them dropped. Every completed result stays (standings,
 *   ELO); future pairings exclude them; each unfinished match they're in
 *   converts to a bye for the opponent (3 match points, counted 2-0, no ELO —
 *   the standard bye semantics). A pending-round bye stays pending so the
 *   round confirm sweep resolves it; an active-round bye resolves on the spot
 *   so the round can still close.
 */
export async function removePlayerFromEventRoster({
  eventId,
  playerId,
}: {
  eventId: string;
  playerId: string;
}): Promise<RemoveRosterResult> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");
  if (event.status === "complete")
    throw new Error("This event is over — the roster is history now");

  const [seat] = await db
    .select()
    .from(eventPlayers)
    .where(
      and(
        eq(eventPlayers.eventId, eventId),
        eq(eventPlayers.playerId, playerId)
      )
    )
    .limit(1);
  if (!seat) throw new Error("Player is not on this event's roster");

  if (event.status === "draft") {
    await db
      .delete(eventPlayers)
      .where(
        and(
          eq(eventPlayers.eventId, eventId),
          eq(eventPlayers.playerId, playerId)
        )
      );
    return { mode: "removed" };
  }

  await db
    .update(eventPlayers)
    .set({ droppedAt: seat.droppedAt ?? new Date() })
    .where(
      and(
        eq(eventPlayers.eventId, eventId),
        eq(eventPlayers.playerId, playerId)
      )
    );

  const openMatches = await db
    .select({ match: matches, roundStatus: rounds.status })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .where(
      and(
        eq(rounds.eventId, eventId),
        ne(matches.status, "complete"),
        sql`(${matches.playerAId} = ${playerId} OR ${matches.playerBId} = ${playerId})`
      )
    );

  let byesGranted = 0;
  for (const { match, roundStatus } of openMatches) {
    // Game rows (if the round already dealt them) are void either way — a
    // converted bye scores as 2-0 regardless of any half-played game.
    await db.delete(games).where(eq(games.matchId, match.id));

    const opponentId =
      match.playerAId === playerId ? match.playerBId : match.playerAId;
    if (!opponentId) {
      // The dropped player held this round's bye — nobody inherits it.
      await db.delete(matches).where(eq(matches.id, match.id));
      continue;
    }

    if (roundStatus === "active") {
      await db
        .update(matches)
        .set({
          playerAId: opponentId,
          playerBId: null,
          status: "complete",
          winnerId: opponentId,
          completedAt: new Date(),
        })
        .where(eq(matches.id, match.id));
      await publish(eventId, {
        type: "match_complete",
        matchId: match.id,
        winnerId: opponentId,
      });
    } else {
      await db
        .update(matches)
        .set({ playerAId: opponentId, playerBId: null, winnerId: null })
        .where(eq(matches.id, match.id));
    }
    byesGranted += 1;
  }

  return { mode: "dropped", byesGranted };
}
