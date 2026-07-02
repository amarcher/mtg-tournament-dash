import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { eventPlayers, events, players } from "@/db/schema";
import { generateJoinToken } from "@/lib/auth";

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
}: {
  eventId: string;
  playerId: string;
}): Promise<{ joinToken: string; alreadyJoined: boolean }> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");

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
  if (existing) return { joinToken: existing.joinToken, alreadyJoined: true };

  if (event.status !== "draft") {
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
