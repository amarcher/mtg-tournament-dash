/**
 * Team draft — pure helpers shared by server actions, queries and client
 * components. No DB, no IO.
 *
 * Two teams draft interlaced around the table, then every member of team A
 * plays every member of team B once (a cross-team round robin, so a 3v3 is
 * three rounds and nine matches). The team with more match wins takes the
 * event. OMW% is meaningless at the team level — each team's opponents are
 * exactly the other team — so the only sensible team tiebreaker is total
 * game wins, and after that it's a genuine tie.
 */

export type TeamSide = "a" | "b";

export const TEAM_SIDES: readonly TeamSide[] = ["a", "b"];

export function isTeamSide(v: unknown): v is TeamSide {
  return v === "a" || v === "b";
}

export function otherSide(side: TeamSide): TeamSide {
  return side === "a" ? "b" : "a";
}

export const DEFAULT_TEAM_NAMES: Record<TeamSide, string> = {
  a: "Team A",
  b: "Team B",
};

export function teamDisplayName(
  side: TeamSide,
  event: { teamAName: string | null; teamBName: string | null }
): string {
  const custom = side === "a" ? event.teamAName : event.teamBName;
  return custom?.trim() || DEFAULT_TEAM_NAMES[side];
}

export type TeamNames = Record<TeamSide, string>;

export function teamNamesFor(event: {
  teamAName: string | null;
  teamBName: string | null;
}): TeamNames {
  return { a: teamDisplayName("a", event), b: teamDisplayName("b", event) };
}

export function formatLabel(format: string): string {
  switch (format) {
    case "team_draft":
      return "Team draft";
    case "swiss":
      return "Swiss";
    case "round_robin":
      return "Round robin";
    case "single_elim":
      return "Single elimination";
    case "commander_pod":
      return "Commander pod";
    default:
      return format;
  }
}

/** Partition a roster by side. Dropped seats are excluded from both teams. */
export function splitTeams<
  T extends { team: TeamSide | null; droppedAt?: Date | null },
>(roster: T[]): { a: T[]; b: T[]; unassigned: T[] } {
  const out = { a: [] as T[], b: [] as T[], unassigned: [] as T[] };
  for (const seat of roster) {
    if (seat.droppedAt) continue;
    if (seat.team === "a") out.a.push(seat);
    else if (seat.team === "b") out.b.push(seat);
    else out.unassigned.push(seat);
  }
  return out;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Snake-draft the roster into two teams by rating: strongest to A, next two
 * to B, next two to A, … so the ELO sums land as close as the ordering
 * allows. Ties in rating are broken by the pre-shuffle so repeated clicks
 * give different (equally balanced) splits.
 */
export function balancedTeamSplit(
  players: { playerId: string; elo: number }[],
  rng: () => number = Math.random
): Map<string, TeamSide> {
  const sorted = shuffle(players, rng).sort((x, y) => y.elo - x.elo);
  const out = new Map<string, TeamSide>();
  sorted.forEach((p, i) => {
    // Snake pattern over pairs: index mod 4 ∈ {0,3} → A, {1,2} → B.
    const slot = i % 4;
    out.set(p.playerId, slot === 0 || slot === 3 ? "a" : "b");
  });
  return out;
}

/** Random split, as even as the count allows. */
export function randomTeamSplit(
  playerIds: string[],
  rng: () => number = Math.random
): Map<string, TeamSide> {
  const out = new Map<string, TeamSide>();
  shuffle(playerIds, rng).forEach((id, i) => out.set(id, i % 2 === 0 ? "a" : "b"));
  return out;
}

/**
 * Interlaced draft seating: A, B, A, B, … clockwise. With unequal teams the
 * surplus players from the larger team take the remaining seats at the end.
 */
export function teamDraftSeatOrder(teamA: string[], teamB: string[]): string[] {
  const out: string[] = [];
  const n = Math.max(teamA.length, teamB.length);
  for (let i = 0; i < n; i++) {
    if (i < teamA.length) out.push(teamA[i]);
    if (i < teamB.length) out.push(teamB[i]);
  }
  return out;
}

export interface TeamRecord {
  /** Match wins, byes included (a bye is a win, same as the player's own line). */
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
  players: number;
}

export type TeamDecision = "match_wins" | "game_wins" | "tie" | "none";

export interface TeamStandings {
  a: TeamRecord;
  b: TeamRecord;
  /** Null while nothing has been played or when the teams are dead level. */
  leader: TeamSide | null;
  decidedBy: TeamDecision;
}

function emptyRecord(): TeamRecord {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    matchPoints: 0,
    gameWins: 0,
    gameLosses: 0,
    gameDraws: 0,
    players: 0,
  };
}

export function computeTeamStandings(
  rows: Array<{
    team: TeamSide | null;
    wins: number;
    losses: number;
    draws: number;
    matchPoints: number;
    gameWins: number;
    gameLosses: number;
    gameDraws: number;
  }>
): TeamStandings {
  const a = emptyRecord();
  const b = emptyRecord();
  for (const r of rows) {
    const t = r.team === "a" ? a : r.team === "b" ? b : null;
    if (!t) continue;
    t.players += 1;
    t.wins += r.wins;
    t.losses += r.losses;
    t.draws += r.draws;
    t.matchPoints += r.matchPoints;
    t.gameWins += r.gameWins;
    t.gameLosses += r.gameLosses;
    t.gameDraws += r.gameDraws;
  }
  const played =
    a.wins + a.losses + a.draws + b.wins + b.losses + b.draws > 0;
  if (!played) return { a, b, leader: null, decidedBy: "none" };
  if (a.wins !== b.wins) {
    return { a, b, leader: a.wins > b.wins ? "a" : "b", decidedBy: "match_wins" };
  }
  if (a.gameWins !== b.gameWins) {
    return {
      a,
      b,
      leader: a.gameWins > b.gameWins ? "a" : "b",
      decidedBy: "game_wins",
    };
  }
  return { a, b, leader: null, decidedBy: "tie" };
}

/**
 * Sort key for standings in a team draft: the leading team's players rank
 * above the other team's. Returns < 0 when `x` outranks `y`; 0 when the
 * comparison should fall through to individual tiebreakers.
 */
export function compareByTeamResult(
  x: { team: TeamSide | null },
  y: { team: TeamSide | null },
  leader: TeamSide | null
): number {
  if (!leader || x.team === y.team) return 0;
  if (x.team === leader) return -1;
  if (y.team === leader) return 1;
  // Unassigned seats (late joins never placed) sink below both teams.
  if (x.team === null) return 1;
  if (y.team === null) return -1;
  return 0;
}
