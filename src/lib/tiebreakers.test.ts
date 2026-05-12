import { describe, it, expect } from "vitest";
import {
  matchPoints,
  matchWinPct,
  gameWinPct,
  opponentMatchWinPct,
  opponentGameWinPct,
  computeTiebreakers,
  compareByMtgTiebreakers,
  TIEBREAKER_FLOOR,
  type PlayerMatchRecord,
} from "./tiebreakers";

function mk(partial: Partial<PlayerMatchRecord> = {}): PlayerMatchRecord {
  return {
    opponents: [],
    matchWins: 0,
    matchLosses: 0,
    matchDraws: 0,
    byes: 0,
    gameWins: 0,
    gameLosses: 0,
    gameDraws: 0,
    ...partial,
  };
}

describe("matchPoints", () => {
  it("3 wins = 9", () => {
    expect(matchPoints(mk({ matchWins: 3 }))).toBe(9);
  });
  it("2 wins + 1 draw = 7", () => {
    expect(matchPoints(mk({ matchWins: 2, matchDraws: 1 }))).toBe(7);
  });
  it("bye counts as a win", () => {
    expect(matchPoints(mk({ matchWins: 2, byes: 1 }))).toBe(9);
  });
});

describe("matchWinPct", () => {
  it("3-0 → 1.0", () => {
    expect(matchWinPct(mk({ matchWins: 3 }))).toBe(1);
  });
  it("1-2 → 0.333", () => {
    expect(matchWinPct(mk({ matchWins: 1, matchLosses: 2 }))).toBeCloseTo(
      1 / 3,
      5
    );
  });
  it("no matches → 0", () => {
    expect(matchWinPct(mk())).toBe(0);
  });
});

describe("gameWinPct", () => {
  it("6-0 in games → 1.0", () => {
    expect(gameWinPct(mk({ gameWins: 6 }))).toBe(1);
  });
  it("bye contributes 2-0 → 1.0 GW%", () => {
    expect(gameWinPct(mk({ byes: 1 }))).toBe(1);
  });
  it("4-2 → 0.667", () => {
    expect(gameWinPct(mk({ gameWins: 4, gameLosses: 2 }))).toBeCloseTo(
      2 / 3,
      5
    );
  });
  it("game draws count as 1 game point each", () => {
    // 1-1-1 → game points = 1·3 + 1 = 4; played = 3; GW% = 4/9 ≈ 0.444
    expect(
      gameWinPct(mk({ gameWins: 1, gameLosses: 1, gameDraws: 1 }))
    ).toBeCloseTo(4 / 9, 5);
  });
});

describe("opponent percentages — floor applied", () => {
  it("opponent with 0% MW gets floored to 33.3%", () => {
    const records = new Map<string, PlayerMatchRecord>([
      ["me", mk({ opponents: ["a"] })],
      ["a", mk({ matchLosses: 3 })],
    ]);
    expect(opponentMatchWinPct(records.get("me")!, records)).toBeCloseTo(
      TIEBREAKER_FLOOR,
      5
    );
  });
  it("3 opponents (3-0, 1-1, 0-3) → mean of (1.0, 0.5, 0.333)", () => {
    const records = new Map<string, PlayerMatchRecord>([
      ["me", mk({ opponents: ["a", "b", "c"] })],
      ["a", mk({ matchWins: 3 })],
      ["b", mk({ matchWins: 1, matchLosses: 1 })],
      ["c", mk({ matchLosses: 3 })],
    ]);
    expect(
      opponentMatchWinPct(records.get("me")!, records)
    ).toBeCloseTo((1 + 0.5 + 1 / 3) / 3, 5);
  });
  it("opponent GW% floored too", () => {
    const records = new Map<string, PlayerMatchRecord>([
      ["me", mk({ opponents: ["a"] })],
      ["a", mk({ gameWins: 0, gameLosses: 6 })],
    ]);
    expect(opponentGameWinPct(records.get("me")!, records)).toBeCloseTo(
      TIEBREAKER_FLOOR,
      5
    );
  });
});

describe("compareByMtgTiebreakers — MTG sort order", () => {
  it("higher match points wins outright", () => {
    const tb = computeTiebreakers(
      new Map([
        ["a", mk({ matchWins: 3 })],
        ["b", mk({ matchWins: 2, matchLosses: 1 })],
      ])
    );
    expect(compareByMtgTiebreakers(tb.get("a")!, tb.get("b")!)).toBeLessThan(0);
  });

  it("tied on MP → higher OMW% wins", () => {
    // Both finished 2-1 (6 pts). a's opponents were stronger.
    const records = new Map<string, PlayerMatchRecord>([
      [
        "a",
        mk({
          matchWins: 2,
          matchLosses: 1,
          opponents: ["x", "y", "z"],
          gameWins: 4,
          gameLosses: 2,
        }),
      ],
      [
        "b",
        mk({
          matchWins: 2,
          matchLosses: 1,
          opponents: ["w", "v", "u"],
          gameWins: 4,
          gameLosses: 2,
        }),
      ],
      ["x", mk({ matchWins: 3 })],
      ["y", mk({ matchWins: 3 })],
      ["z", mk({ matchWins: 2, matchLosses: 1 })],
      ["w", mk({ matchLosses: 3 })],
      ["v", mk({ matchLosses: 3 })],
      ["u", mk({ matchLosses: 3 })],
    ]);
    const tb = computeTiebreakers(records);
    expect(compareByMtgTiebreakers(tb.get("a")!, tb.get("b")!)).toBeLessThan(0);
  });

  it("tied on MP and OMW% → higher GW% wins", () => {
    // Both 2-1, same opponents → same OMW%. a swept 2-0 each win; b went 2-1.
    const records = new Map<string, PlayerMatchRecord>([
      [
        "a",
        mk({
          matchWins: 2,
          matchLosses: 1,
          opponents: ["x", "y", "z"],
          gameWins: 4,
          gameLosses: 2,
        }),
      ],
      [
        "b",
        mk({
          matchWins: 2,
          matchLosses: 1,
          opponents: ["x", "y", "z"],
          gameWins: 4,
          gameLosses: 4,
        }),
      ],
      ["x", mk({ matchWins: 1, matchLosses: 2 })],
      ["y", mk({ matchWins: 1, matchLosses: 2 })],
      ["z", mk({ matchWins: 1, matchLosses: 2 })],
    ]);
    const tb = computeTiebreakers(records);
    expect(compareByMtgTiebreakers(tb.get("a")!, tb.get("b")!)).toBeLessThan(0);
  });
});
