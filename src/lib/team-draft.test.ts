import { describe, it, expect } from "vitest";
import {
  balancedTeamSplit,
  compareByTeamResult,
  computeTeamStandings,
  randomTeamSplit,
  splitTeams,
  teamDisplayName,
  teamDraftSeatOrder,
} from "./team-draft";

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const row = (
  team: "a" | "b" | null,
  wins: number,
  losses: number,
  draws: number,
  gameWins: number,
  gameLosses: number,
  gameDraws = 0
) => ({
  team,
  wins,
  losses,
  draws,
  matchPoints: wins * 3 + draws,
  gameWins,
  gameLosses,
  gameDraws,
});

describe("computeTeamStandings", () => {
  it("nothing played → no leader", () => {
    const s = computeTeamStandings([row("a", 0, 0, 0, 0, 0), row("b", 0, 0, 0, 0, 0)]);
    expect(s.leader).toBeNull();
    expect(s.decidedBy).toBe("none");
  });

  it("more match wins decides", () => {
    const s = computeTeamStandings([
      row("a", 2, 1, 0, 4, 3),
      row("a", 1, 2, 0, 3, 4),
      row("a", 2, 1, 0, 5, 2),
      row("b", 1, 2, 0, 3, 4),
      row("b", 2, 1, 0, 4, 3),
      row("b", 1, 2, 0, 2, 5),
    ]);
    expect(s.a.wins).toBe(5);
    expect(s.b.wins).toBe(4);
    expect(s.leader).toBe("a");
    expect(s.decidedBy).toBe("match_wins");
  });

  it("equal match wins → game wins break the tie", () => {
    const s = computeTeamStandings([
      row("a", 1, 1, 0, 4, 2),
      row("b", 1, 1, 0, 2, 4),
    ]);
    expect(s.leader).toBe("a");
    expect(s.decidedBy).toBe("game_wins");
  });

  it("dead level → tie", () => {
    const s = computeTeamStandings([
      row("a", 1, 1, 0, 3, 3),
      row("b", 1, 1, 0, 3, 3),
    ]);
    expect(s.leader).toBeNull();
    expect(s.decidedBy).toBe("tie");
  });

  it("draws count for both sides and don't change the leader on their own", () => {
    const s = computeTeamStandings([
      row("a", 1, 0, 1, 3, 1, 1),
      row("b", 0, 1, 1, 1, 3, 1),
    ]);
    expect(s.a.draws).toBe(1);
    expect(s.b.draws).toBe(1);
    expect(s.leader).toBe("a");
  });

  it("ignores unassigned seats", () => {
    const s = computeTeamStandings([row(null, 3, 0, 0, 6, 0), row("b", 1, 0, 0, 2, 0)]);
    expect(s.a.players).toBe(0);
    expect(s.leader).toBe("b");
  });
});

describe("compareByTeamResult", () => {
  const a = { team: "a" as const };
  const b = { team: "b" as const };
  const none = { team: null };
  it("leading team first", () => {
    expect(compareByTeamResult(a, b, "a")).toBeLessThan(0);
    expect(compareByTeamResult(b, a, "a")).toBeGreaterThan(0);
  });
  it("falls through within a team or with no leader", () => {
    expect(compareByTeamResult(a, a, "a")).toBe(0);
    expect(compareByTeamResult(a, b, null)).toBe(0);
  });
  it("unassigned sinks below the losing team", () => {
    expect(compareByTeamResult(none, b, "a")).toBeGreaterThan(0);
    expect(compareByTeamResult(b, none, "a")).toBeLessThan(0);
  });
});

describe("teamDraftSeatOrder", () => {
  it("interlaces A and B", () => {
    expect(teamDraftSeatOrder(["a1", "a2", "a3"], ["b1", "b2", "b3"])).toEqual([
      "a1", "b1", "a2", "b2", "a3", "b3",
    ]);
  });
  it("surplus players fill the end", () => {
    expect(teamDraftSeatOrder(["a1", "a2", "a3"], ["b1"])).toEqual(["a1", "b1", "a2", "a3"]);
  });
});

describe("team splits", () => {
  const players = [
    { playerId: "p1", elo: 1400 },
    { playerId: "p2", elo: 1300 },
    { playerId: "p3", elo: 1250 },
    { playerId: "p4", elo: 1200 },
    { playerId: "p5", elo: 1150 },
    { playerId: "p6", elo: 1000 },
  ];

  it("balancedTeamSplit snakes by rating into 3v3", () => {
    const m = balancedTeamSplit(players, seededRng(2));
    expect(m.get("p1")).toBe("a");
    expect(m.get("p2")).toBe("b");
    expect(m.get("p3")).toBe("b");
    expect(m.get("p4")).toBe("a");
    expect(m.get("p5")).toBe("a");
    expect(m.get("p6")).toBe("b");
  });

  it("randomTeamSplit is as even as the count allows", () => {
    const m = randomTeamSplit(players.map((p) => p.playerId), seededRng(4));
    const a = [...m.values()].filter((v) => v === "a").length;
    expect(a).toBe(3);
    const odd = randomTeamSplit(["x", "y", "z"], seededRng(4));
    expect([...odd.values()].filter((v) => v === "a").length).toBe(2);
  });

  it("splitTeams drops dropped seats and keeps unassigned apart", () => {
    const r = splitTeams([
      { team: "a" as const, droppedAt: null },
      { team: "b" as const, droppedAt: new Date() },
      { team: null, droppedAt: null },
    ]);
    expect(r.a).toHaveLength(1);
    expect(r.b).toHaveLength(0);
    expect(r.unassigned).toHaveLength(1);
  });
});

describe("teamDisplayName", () => {
  it("falls back to Team A / Team B", () => {
    expect(teamDisplayName("a", { teamAName: null, teamBName: null })).toBe("Team A");
    expect(teamDisplayName("b", { teamAName: "", teamBName: "  " })).toBe("Team B");
    expect(teamDisplayName("a", { teamAName: "Goblins", teamBName: null })).toBe("Goblins");
  });
});
