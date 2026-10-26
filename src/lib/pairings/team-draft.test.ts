import { describe, it, expect } from "vitest";
import { generateTeamDraftPairings, type TeamPlayer } from "./team-draft";

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function team(prefix: string, n: number): TeamPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    playerId: `${prefix}${i + 1}`,
    opponentsFaced: [],
  }));
}

function record(team: TeamPlayer[], oppId: string, selfId: string) {
  team.find((p) => p.playerId === selfId)!.opponentsFaced.push(oppId);
}

describe("generateTeamDraftPairings", () => {
  it("3v3 round 1: three cross-team tables, no byes, A on side A", () => {
    const a = team("a", 3);
    const b = team("b", 3);
    const pairings = generateTeamDraftPairings(a, b, { rng: seededRng(7) });
    expect(pairings).toHaveLength(3);
    for (const p of pairings) {
      expect(p.playerAId.startsWith("a")).toBe(true);
      expect(p.playerBId!.startsWith("b")).toBe(true);
    }
    expect(new Set(pairings.flatMap((p) => [p.playerAId, p.playerBId!])).size).toBe(6);
    expect(pairings.map((p) => p.tableNumber)).toEqual([1, 2, 3]);
  });

  it("completes the cross-team round robin over |team| rounds with no rematches", () => {
    const a = team("a", 3);
    const b = team("b", 3);
    const rng = seededRng(3);
    const seen = new Set<string>();
    for (let round = 0; round < 3; round++) {
      const pairings = generateTeamDraftPairings(a, b, { rng });
      for (const p of pairings) {
        const key = `${p.playerAId}|${p.playerBId}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        record(a, p.playerBId!, p.playerAId);
        record(b, p.playerAId, p.playerBId!);
      }
    }
    expect(seen.size).toBe(9);
    for (const p of a) expect(new Set(p.opponentsFaced).size).toBe(3);
  });

  it("works around a hand-edited round 1 that broke the natural rotation", () => {
    const a = team("a", 3);
    const b = team("b", 3);
    // Organizer paired a1-b2, a2-b1, a3-b3 by hand.
    for (const [x, y] of [
      ["a1", "b2"],
      ["a2", "b1"],
      ["a3", "b3"],
    ] as const) {
      record(a, y, x);
      record(b, x, y);
    }
    for (let round = 0; round < 2; round++) {
      const pairings = generateTeamDraftPairings(a, b, { rng: seededRng(round + 1) });
      for (const p of pairings) {
        const ap = a.find((q) => q.playerId === p.playerAId)!;
        expect(ap.opponentsFaced).not.toContain(p.playerBId);
        record(a, p.playerBId!, p.playerAId);
        record(b, p.playerAId, p.playerBId!);
      }
    }
    for (const p of a) expect([...p.opponentsFaced].sort()).toEqual(["b1", "b2", "b3"]);
  });

  it("unequal teams: the surplus side takes byes, smaller side all paired", () => {
    const a = team("a", 3);
    const b = team("b", 2);
    const pairings = generateTeamDraftPairings(a, b, { rng: seededRng(5) });
    expect(pairings).toHaveLength(3);
    const byes = pairings.filter((p) => p.playerBId === null);
    expect(byes).toHaveLength(1);
    expect(byes[0].playerAId.startsWith("a")).toBe(true);
    const real = pairings.filter((p) => p.playerBId !== null);
    expect(new Set(real.map((p) => p.playerBId)).size).toBe(2);
  });

  it("surplus on team B still keeps team A on side A of real matches", () => {
    const a = team("a", 2);
    const b = team("b", 3);
    const pairings = generateTeamDraftPairings(a, b, { rng: seededRng(9) });
    const real = pairings.filter((p) => p.playerBId !== null);
    expect(real).toHaveLength(2);
    for (const p of real) {
      expect(p.playerAId.startsWith("a")).toBe(true);
      expect(p.playerBId!.startsWith("b")).toBe(true);
    }
    expect(pairings.filter((p) => p.playerBId === null)[0].playerAId.startsWith("b")).toBe(true);
  });

  it("falls back to the fewest rematches once the round robin is exhausted", () => {
    const a = team("a", 2);
    const b = team("b", 2);
    for (const x of a) for (const y of b) {
      record(a, y.playerId, x.playerId);
      record(b, x.playerId, y.playerId);
    }
    const pairings = generateTeamDraftPairings(a, b, { rng: seededRng(1) });
    expect(pairings).toHaveLength(2);
    expect(pairings.every((p) => p.playerBId !== null)).toBe(true);
  });

  it("empty input → no pairings", () => {
    expect(generateTeamDraftPairings([], [])).toEqual([]);
  });
});
