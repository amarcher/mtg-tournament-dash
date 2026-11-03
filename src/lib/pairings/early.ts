/**
 * Early pairings — pure helpers. No DB, no IO.
 *
 * While round N is running, two players whose round-N matches are already
 * finished can be locked together as a round N+1 pairing and start playing
 * at once. This module decides who is eligible; the Swiss generator in
 * ./swiss.ts honours the locks when the rest of round N+1 is drawn.
 */

export type SeatedPlayer = { playerId: string; droppedAt: Date | null };

/** A match that still ties its players to a table right now. */
export type RunningMatch = { playerAId: string; playerBId: string | null };

export type EarlyLockContext = {
  format: string;
  eventStatus: string;
  nextRoundNumber: number;
  totalRounds: number;
};

export function participantsOf(m: RunningMatch): string[] {
  return m.playerBId ? [m.playerAId, m.playerBId] : [m.playerAId];
}

/**
 * Who can be locked into the next round: seated, not dropped, not at a
 * table right now (an in_progress match anywhere in the event, or a pending
 * one in the active round) and not already placed in the next round.
 */
export function lockablePlayers<T extends SeatedPlayer>(
  roster: T[],
  running: RunningMatch[],
  nextRoundMatches: RunningMatch[]
): T[] {
  const tiedUp = new Set<string>();
  for (const m of [...running, ...nextRoundMatches]) {
    for (const id of participantsOf(m)) tiedUp.add(id);
  }
  return roster.filter((p) => !p.droppedAt && !tiedUp.has(p.playerId));
}

/**
 * The reason two players can't be locked together, or null when they can.
 * The event-level checks come first so the message names the real blocker
 * on a finished or team-draft event instead of a confusing player one.
 */
export function earlyLockBlocker(
  ctx: EarlyLockContext,
  lockable: ReadonlySet<string>,
  playerAId: string,
  playerBId: string
): string | null {
  if (ctx.format === "team_draft")
    return "Early pairings are only for Swiss events";
  if (ctx.eventStatus === "complete") return "Event is already complete";
  if (ctx.eventStatus !== "active")
    return "Start round 1 before pairing anyone early";
  if (ctx.nextRoundNumber > ctx.totalRounds)
    return "All rounds have been played";
  if (!playerAId || !playerBId) return "Pick two players";
  if (playerAId === playerBId) return "Player can't be paired with themselves";
  for (const id of [playerAId, playerBId]) {
    if (!lockable.has(id))
      return "Both players must be seated, finished with the current round and not already in the next one";
  }
  return null;
}
