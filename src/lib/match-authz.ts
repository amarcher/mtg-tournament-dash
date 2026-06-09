/**
 * Authorization guard for match-mutating actions (life adjust, report winner,
 * report draw). The read path (`/api/events/[id]/match/[matchId]/state`)
 * already checks this via `getCurrentPlayer`; the mutating server actions did
 * not, leaving them less protected than reads. A server action is a POST
 * endpoint, so without this check anyone who can reach the action with a
 * `matchId` could mutate a match they're not part of.
 *
 * Identity-only by design: callers keep their own status/idempotency handling
 * (e.g. report-winner no-ops on an already-complete match), so this guard does
 * not assert match status.
 */
export function isMatchParticipant(
  callerPlayerId: string | null | undefined,
  playerAId: string,
  playerBId: string | null
): boolean {
  if (!callerPlayerId) return false;
  return callerPlayerId === playerAId || callerPlayerId === playerBId;
}
