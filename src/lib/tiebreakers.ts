/**
 * MTG tournament tiebreakers — pure functions, no DB.
 *
 * Per the Magic Tournament Rules (https://mtg.fandom.com/wiki/Tiebreaker),
 * event standings after match points are broken by:
 *   1. Opponents' Match-Win Percentage (OMW%)
 *   2. Game-Win Percentage (GW%)
 *   3. Opponents' Game-Win Percentage (OGW%)
 *
 * Key rules:
 *   • All opponent percentages have a 33.3% floor (so undefeated players
 *     aren't penalized for facing weaker opponents).
 *   • Match-Win % = matchPoints / (3 × matchesPlayed)
 *   • Game-Win  % = gamePoints  / (3 × gamesPlayed)
 *     where gamePoints = 3·gameWins + 1·gameDraws.
 *   • A bye counts as a 2-0 win for the player's own MP and GW%, but the
 *     bye round contributes no opponent to OMW%/OGW%.
 */

export const TIEBREAKER_FLOOR = 1 / 3;

export interface PlayerMatchRecord {
  /** Real opponents only — one entry per match played (excludes byes). */
  opponents: string[];
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  /** Byes received. Each counts as a match win for MP and as 2-0 for GW%. */
  byes: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
}

function floor(v: number): number {
  return Math.max(v, TIEBREAKER_FLOOR);
}

export function matchesPlayed(r: PlayerMatchRecord): number {
  return r.matchWins + r.matchLosses + r.matchDraws + r.byes;
}

export function matchPoints(r: PlayerMatchRecord): number {
  return (r.matchWins + r.byes) * 3 + r.matchDraws;
}

export function matchWinPct(r: PlayerMatchRecord): number {
  const played = matchesPlayed(r);
  if (played === 0) return 0;
  return matchPoints(r) / (3 * played);
}

export function gamesPlayed(r: PlayerMatchRecord): number {
  return r.gameWins + r.gameLosses + r.gameDraws + r.byes * 2;
}

export function gamePoints(r: PlayerMatchRecord): number {
  return (r.gameWins + r.byes * 2) * 3 + r.gameDraws;
}

export function gameWinPct(r: PlayerMatchRecord): number {
  const played = gamesPlayed(r);
  if (played === 0) return 0;
  return gamePoints(r) / (3 * played);
}

export function opponentMatchWinPct(
  player: PlayerMatchRecord,
  recordsById: Map<string, PlayerMatchRecord>
): number {
  if (player.opponents.length === 0) return 0;
  let sum = 0;
  for (const oppId of player.opponents) {
    const opp = recordsById.get(oppId);
    if (!opp) continue;
    sum += floor(matchWinPct(opp));
  }
  return sum / player.opponents.length;
}

export function opponentGameWinPct(
  player: PlayerMatchRecord,
  recordsById: Map<string, PlayerMatchRecord>
): number {
  if (player.opponents.length === 0) return 0;
  let sum = 0;
  for (const oppId of player.opponents) {
    const opp = recordsById.get(oppId);
    if (!opp) continue;
    sum += floor(gameWinPct(opp));
  }
  return sum / player.opponents.length;
}

export interface Tiebreakers {
  matchPoints: number;
  matchWinPct: number;
  gameWinPct: number;
  opponentMatchWinPct: number;
  opponentGameWinPct: number;
}

export function computeTiebreakers(
  records: Map<string, PlayerMatchRecord>
): Map<string, Tiebreakers> {
  const out = new Map<string, Tiebreakers>();
  for (const [id, r] of records) {
    out.set(id, {
      matchPoints: matchPoints(r),
      matchWinPct: matchWinPct(r),
      gameWinPct: gameWinPct(r),
      opponentMatchWinPct: opponentMatchWinPct(r, records),
      opponentGameWinPct: opponentGameWinPct(r, records),
    });
  }
  return out;
}

/**
 * MTG event-standings comparator. Returns < 0 when `a` outranks `b`.
 * Ordering: MP DESC > OMW% DESC > GW% DESC > OGW% DESC.
 */
export function compareByMtgTiebreakers(
  a: Tiebreakers,
  b: Tiebreakers
): number {
  if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
  if (a.opponentMatchWinPct !== b.opponentMatchWinPct) {
    return b.opponentMatchWinPct - a.opponentMatchWinPct;
  }
  if (a.gameWinPct !== b.gameWinPct) return b.gameWinPct - a.gameWinPct;
  if (a.opponentGameWinPct !== b.opponentGameWinPct) {
    return b.opponentGameWinPct - a.opponentGameWinPct;
  }
  return 0;
}
