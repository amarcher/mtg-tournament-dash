export const DEFAULT_K = 32;
export const STARTING_ELO = 1200;

export type EloOutcome = "win" | "loss" | "draw";

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export function scoreFor(outcome: EloOutcome): number {
  if (outcome === "win") return 1;
  if (outcome === "draw") return 0.5;
  return 0;
}

/**
 * Returns the new rating for `player` after a single match against `opponent`.
 * Rounds to the nearest integer (standard practice for displayed ratings).
 */
export function updatedRating(
  playerRating: number,
  opponentRating: number,
  outcome: EloOutcome,
  k: number = DEFAULT_K
): number {
  const expected = expectedScore(playerRating, opponentRating);
  const actual = scoreFor(outcome);
  return Math.round(playerRating + k * (actual - expected));
}

export interface MatchEloResult {
  playerA: { before: number; after: number; delta: number };
  playerB: { before: number; after: number; delta: number };
}

/**
 * Compute symmetric ELO update for a head-to-head match.
 * Pass winnerId === null/undefined for a draw.
 */
export function computeMatchElo(args: {
  playerAId: string;
  playerARating: number;
  playerBId: string;
  playerBRating: number;
  winnerId: string | null;
  k?: number;
}): MatchEloResult {
  const k = args.k ?? DEFAULT_K;
  const aOutcome: EloOutcome =
    args.winnerId === null
      ? "draw"
      : args.winnerId === args.playerAId
        ? "win"
        : "loss";
  const bOutcome: EloOutcome =
    args.winnerId === null
      ? "draw"
      : args.winnerId === args.playerBId
        ? "win"
        : "loss";

  const aAfter = updatedRating(args.playerARating, args.playerBRating, aOutcome, k);
  const bAfter = updatedRating(args.playerBRating, args.playerARating, bOutcome, k);

  return {
    playerA: {
      before: args.playerARating,
      after: aAfter,
      delta: aAfter - args.playerARating,
    },
    playerB: {
      before: args.playerBRating,
      after: bAfter,
      delta: bAfter - args.playerBRating,
    },
  };
}
