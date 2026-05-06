import { describe, it, expect } from "vitest";
import { generateSwissPairings, type PlayerStanding } from "./swiss";

function mkStanding(
  id: string,
  matchPoints = 0,
  opponentsFaced: string[] = [],
  hasHadBye = false
): PlayerStanding {
  return { playerId: id, matchPoints, opponentsFaced, hasHadBye };
}

// Deterministic RNG so tests are stable.
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe("generateSwissPairings — round 1", () => {
  it("6 players → 3 matches, no byes", () => {
    const standings = ["a", "b", "c", "d", "e", "f"].map((id) => mkStanding(id));
    const pairings = generateSwissPairings(standings, { rng: seededRng(1) });
    expect(pairings).toHaveLength(3);
    expect(pairings.every((p) => p.playerBId !== null)).toBe(true);
    const seen = new Set<string>();
    for (const p of pairings) {
      seen.add(p.playerAId);
      seen.add(p.playerBId!);
    }
    expect(seen.size).toBe(6);
  });

  it("table numbers are contiguous starting at 1", () => {
    const standings = ["a", "b", "c", "d"].map((id) => mkStanding(id));
    const pairings = generateSwissPairings(standings, { rng: seededRng(1) });
    expect(pairings.map((p) => p.tableNumber).sort()).toEqual([1, 2]);
  });
});

describe("generateSwissPairings — odd player count", () => {
  it("5 players → 2 matches + 1 bye to lowest-standing without prior bye", () => {
    const standings: PlayerStanding[] = [
      mkStanding("a", 6),
      mkStanding("b", 3),
      mkStanding("c", 3),
      mkStanding("d", 0),
      mkStanding("e", 0),
    ];
    const pairings = generateSwissPairings(standings, { rng: seededRng(1) });
    const byes = pairings.filter((p) => p.playerBId === null);
    expect(byes).toHaveLength(1);
    // Lowest standing — either d or e (both 0 pts, sorted by id ASC → d first in
    // sorted list, e last → e is lowest).
    expect(byes[0].playerAId).toBe("e");
  });

  it("won't give a player two byes if avoidable", () => {
    const standings: PlayerStanding[] = [
      mkStanding("a", 6),
      mkStanding("b", 3),
      mkStanding("c", 3),
      mkStanding("d", 0),
      mkStanding("e", 0, [], /* hasHadBye */ true),
    ];
    const pairings = generateSwissPairings(standings, { rng: seededRng(1) });
    const byes = pairings.filter((p) => p.playerBId === null);
    expect(byes).toHaveLength(1);
    // e already had a bye; next-lowest without bye is d.
    expect(byes[0].playerAId).toBe("d");
  });
});

describe("generateSwissPairings — rematch avoidance", () => {
  it("avoids a rematch when a non-faced opponent is available", () => {
    // 4 players, all 3 points (1-1 each). a has faced b. Pairings should not
    // produce (a, b) because (a, c or d) is available.
    const standings: PlayerStanding[] = [
      mkStanding("a", 3, ["b"]),
      mkStanding("b", 3, ["a"]),
      mkStanding("c", 3, ["d"]),
      mkStanding("d", 3, ["c"]),
    ];
    const pairings = generateSwissPairings(standings, { rng: seededRng(42) });
    for (const p of pairings) {
      const faced = standings
        .find((s) => s.playerId === p.playerAId)!
        .opponentsFaced.includes(p.playerBId!);
      expect(faced).toBe(false);
    }
  });
});

describe("generateSwissPairings — by-points grouping", () => {
  it("higher-record players paired together when possible", () => {
    const standings: PlayerStanding[] = [
      mkStanding("a", 6),
      mkStanding("b", 6),
      mkStanding("c", 3),
      mkStanding("d", 3),
      mkStanding("e", 0),
      mkStanding("f", 0),
    ];
    const pairings = generateSwissPairings(standings, { rng: seededRng(1) });
    const pairsAsSet = pairings.map((p) =>
      [p.playerAId, p.playerBId].sort().join("-")
    );
    expect(pairsAsSet).toContain("a-b");
    expect(pairsAsSet).toContain("c-d");
    expect(pairsAsSet).toContain("e-f");
  });
});

describe("generateSwissPairings — full 3-round event", () => {
  it("simulating 3 rounds for 6 players, no rematches occur", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const points: Record<string, number> = Object.fromEntries(
      ids.map((id) => [id, 0])
    );
    const faced: Record<string, string[]> = Object.fromEntries(
      ids.map((id) => [id, []])
    );

    for (let round = 1; round <= 3; round++) {
      const standings = ids.map((id) =>
        mkStanding(id, points[id], faced[id])
      );
      const pairings = generateSwissPairings(standings, {
        rng: seededRng(round * 17),
      });
      expect(pairings).toHaveLength(3);

      for (const p of pairings) {
        const a = p.playerAId;
        const b = p.playerBId!;
        // No rematch.
        expect(faced[a]).not.toContain(b);
        faced[a].push(b);
        faced[b].push(a);
        // Deterministic outcome: alphabetically earlier wins.
        const winner = a < b ? a : b;
        points[winner] += 3;
      }
    }
    // Everyone played exactly 3 unique opponents.
    for (const id of ids) expect(faced[id]).toHaveLength(3);
  });
});
