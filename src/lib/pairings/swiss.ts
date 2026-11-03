/**
 * Swiss pairings — pure function. No DB, no IO.
 *
 * Approach: backtracking search over all perfect matchings, scored by
 * Σ (matchPointDiff)². Rematches are a hard constraint (skipped if any
 * rematch-free matching exists). Byes are assigned to the lowest-standing
 * player without a prior bye when the count is odd.
 *
 * This is fine for ≤16 players (millisecond search). Beyond that we'd want
 * Edmonds' blossom algorithm.
 */

export interface PlayerStanding {
  playerId: string;
  matchPoints: number;
  /** Player ids this player has already faced (for rematch avoidance). */
  opponentsFaced: string[];
  /** Whether this player has already received a bye in this event. */
  hasHadBye: boolean;
}

export interface PairingResult {
  playerAId: string;
  playerBId: string | null; // null = bye
  tableNumber: number;
  /** True for a pairing the organizer locked in early; it was never searched. */
  locked?: boolean;
}

/** Two players the organizer locked together before the round was drawn. */
export interface LockedPair {
  playerAId: string;
  playerBId: string;
}

export interface PairingOptions {
  rng?: () => number;
  /**
   * Pairings fixed ahead of the draw. They come out first, at tables 1..k in
   * the order given, and their players are removed from the Swiss search —
   * the rest of the field is paired around them, bye included.
   */
  locked?: LockedPair[];
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Matching {
  pairs: Array<[PlayerStanding, PlayerStanding]>;
  cost: number;
  hasRematch: boolean;
}

function pairCost(a: PlayerStanding, b: PlayerStanding): number {
  const diff = a.matchPoints - b.matchPoints;
  return diff * diff;
}

/**
 * Recursive backtracking search. Finds the matching with the minimum cost
 * that contains no rematches. If no rematch-free matching exists, returns
 * the minimum-cost matching overall (so we still pair everyone).
 */
function findBestMatching(pool: PlayerStanding[]): Matching {
  let best: Matching | null = null;
  let bestNoRematch: Matching | null = null;

  function recurse(
    remaining: PlayerStanding[],
    pairs: Array<[PlayerStanding, PlayerStanding]>,
    cost: number,
    hasRematch: boolean
  ) {
    if (remaining.length === 0) {
      const m: Matching = { pairs: pairs.slice(), cost, hasRematch };
      if (!hasRematch) {
        if (!bestNoRematch || cost < bestNoRematch.cost) bestNoRematch = m;
      }
      if (!best || cost < best.cost) best = m;
      // Prune: if we already have a rematch-free matching with lower cost,
      // bail on rematch-containing branches.
      return;
    }
    const a = remaining[0];
    for (let i = 1; i < remaining.length; i++) {
      const b = remaining[i];
      const isRematch = a.opponentsFaced.includes(b.playerId);
      // If we already have a rematch-free best, skip rematch branches.
      if (isRematch && bestNoRematch) continue;
      const newCost = cost + pairCost(a, b);
      // Prune: if cost already exceeds best rematch-free, skip.
      if (bestNoRematch && newCost >= bestNoRematch.cost) continue;
      const next = remaining.slice(1, i).concat(remaining.slice(i + 1));
      recurse(next, [...pairs, [a, b]], newCost, hasRematch || isRematch);
    }
  }

  recurse(pool, [], 0, false);
  return bestNoRematch ?? best!;
}

export function generateSwissPairings(
  standings: PlayerStanding[],
  options: PairingOptions = {}
): PairingResult[] {
  const rng = options.rng ?? Math.random;
  const locked = options.locked ?? [];

  const lockedIds = new Set<string>();
  for (const { playerAId, playerBId } of locked) {
    if (playerAId === playerBId)
      throw new Error("A locked pairing needs two different players");
    for (const id of [playerAId, playerBId]) {
      if (lockedIds.has(id))
        throw new Error("A player can only be locked into one pairing");
      lockedIds.add(id);
    }
  }
  const lockedPairings: PairingResult[] = locked.map((l, i) => ({
    playerAId: l.playerAId,
    playerBId: l.playerBId,
    tableNumber: i + 1,
    locked: true,
  }));
  const field = standings.filter((p) => !lockedIds.has(p.playerId));
  if (field.length === 0) return lockedPairings;

  // Pre-shuffle so pairings of equal-cost matchings vary between rounds.
  // Then sort by match points DESC; within equal points the shuffle order persists.
  const preshuffled = shuffle(field, rng);
  const sorted = preshuffled.slice().sort((a, b) => b.matchPoints - a.matchPoints);

  // Bye assignment for odd counts.
  let byePlayerId: string | null = null;
  let pool = sorted;
  if (sorted.length % 2 === 1) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!sorted[i].hasHadBye) {
        byePlayerId = sorted[i].playerId;
        break;
      }
    }
    if (byePlayerId === null) byePlayerId = sorted[sorted.length - 1].playerId;
    pool = sorted.filter((p) => p.playerId !== byePlayerId);
  }

  const matching = findBestMatching(pool);

  let tableNumber = lockedPairings.length + 1;
  const pairings: PairingResult[] = lockedPairings.concat(
    matching.pairs.map(([a, b]) => ({
      playerAId: a.playerId,
      playerBId: b.playerId,
      tableNumber: tableNumber++,
    }))
  );

  if (byePlayerId) {
    pairings.push({
      playerAId: byePlayerId,
      playerBId: null,
      tableNumber: tableNumber++,
    });
  }

  return pairings;
}
