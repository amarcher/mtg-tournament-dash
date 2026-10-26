/**
 * Team-draft pairings — pure function. No DB, no IO.
 *
 * Each round pairs every team-A player against a team-B player they haven't
 * faced, so over |team| rounds the cross-team round robin completes. Derived
 * from history rather than a fixed rotation, so an organizer who swapped
 * seats by hand in an earlier round still gets a valid remainder.
 *
 * Backtracking over the bipartite matchings minimises the rematch count
 * (zero whenever the history allows it). If the teams are unequal — someone
 * dropped mid-event — the surplus players on the larger team take byes.
 */
import type { PairingResult, PairingOptions } from "./swiss";

export interface TeamPlayer {
  playerId: string;
  /** Player ids already faced in this event. */
  opponentsFaced: string[];
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function timesFaced(a: TeamPlayer, b: TeamPlayer): number {
  let n = 0;
  for (const id of a.opponentsFaced) if (id === b.playerId) n++;
  return n;
}

function findMinRematchMatching(
  left: TeamPlayer[],
  right: TeamPlayer[]
): Array<[TeamPlayer, TeamPlayer | null]> {
  let best: Array<[TeamPlayer, TeamPlayer | null]> | null = null;
  let bestCost = Infinity;

  function recurse(
    i: number,
    used: Set<string>,
    pairs: Array<[TeamPlayer, TeamPlayer | null]>,
    cost: number
  ) {
    if (cost >= bestCost) return;
    if (i === left.length) {
      best = pairs.slice();
      bestCost = cost;
      return;
    }
    const a = left[i];
    const slotsLeft = left.length - i;
    const partnersLeft = right.length - used.size;
    // Only hand out a bye when there aren't enough right-side players for
    // the remaining left-side players.
    if (partnersLeft < slotsLeft) {
      recurse(i + 1, used, [...pairs, [a, null]], cost);
    }
    for (const b of right) {
      if (used.has(b.playerId)) continue;
      used.add(b.playerId);
      recurse(i + 1, used, [...pairs, [a, b]], cost + timesFaced(a, b));
      used.delete(b.playerId);
    }
  }

  recurse(0, new Set(), [], 0);
  return best ?? [];
}

export function generateTeamDraftPairings(
  teamA: TeamPlayer[],
  teamB: TeamPlayer[],
  options: PairingOptions = {}
): PairingResult[] {
  const rng = options.rng ?? Math.random;
  if (teamA.length === 0 && teamB.length === 0) return [];

  // Search from the larger side so the smaller side is always fully used
  // and byes land on the surplus.
  const aIsLarger = teamA.length >= teamB.length;
  const left = shuffle(aIsLarger ? teamA : teamB, rng);
  const right = shuffle(aIsLarger ? teamB : teamA, rng);

  const matching = findMinRematchMatching(left, right);

  let tableNumber = 1;
  const real = matching.filter(([, b]) => b !== null);
  const byes = matching.filter(([, b]) => b === null);
  const pairings: PairingResult[] = real.map(([l, r]) => ({
    // Keep team A on side A of the match row regardless of search order.
    playerAId: aIsLarger ? l.playerId : r!.playerId,
    playerBId: aIsLarger ? r!.playerId : l.playerId,
    tableNumber: tableNumber++,
  }));
  for (const [l] of byes) {
    pairings.push({ playerAId: l.playerId, playerBId: null, tableNumber: tableNumber++ });
  }
  return pairings;
}
