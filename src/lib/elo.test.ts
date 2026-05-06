import { describe, it, expect } from "vitest";
import {
  expectedScore,
  computeMatchElo,
  updatedRating,
  STARTING_ELO,
  DEFAULT_K,
} from "./elo";

describe("expectedScore", () => {
  it("equal ratings → 0.5", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
  });
  it("higher rating → > 0.5", () => {
    expect(expectedScore(1600, 1500)).toBeGreaterThan(0.5);
  });
  it("lower rating → < 0.5", () => {
    expect(expectedScore(1400, 1500)).toBeLessThan(0.5);
  });
  it("400 point gap → expected ≈ 0.909", () => {
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 2);
  });
});

describe("updatedRating", () => {
  it("equal opponents, win adds K/2 = 16", () => {
    expect(updatedRating(1500, 1500, "win")).toBe(1500 + 16);
  });
  it("equal opponents, loss subtracts K/2 = 16", () => {
    expect(updatedRating(1500, 1500, "loss")).toBe(1500 - 16);
  });
  it("equal opponents, draw is no change", () => {
    expect(updatedRating(1500, 1500, "draw")).toBe(1500);
  });
});

describe("computeMatchElo", () => {
  it("symmetric: winner gain == loser loss when ratings equal", () => {
    const r = computeMatchElo({
      playerAId: "a",
      playerARating: STARTING_ELO,
      playerBId: "b",
      playerBRating: STARTING_ELO,
      winnerId: "a",
    });
    expect(r.playerA.delta).toBe(-r.playerB.delta);
    expect(r.playerA.delta).toBe(16);
    expect(r.playerB.delta).toBe(-16);
  });

  it("upset: lower-rated winner gains more", () => {
    const upset = computeMatchElo({
      playerAId: "a",
      playerARating: 1200,
      playerBId: "b",
      playerBRating: 1600,
      winnerId: "a",
    });
    expect(upset.playerA.delta).toBeGreaterThan(16);
    expect(upset.playerB.delta).toBeLessThan(-16);
    expect(upset.playerA.delta).toBe(-upset.playerB.delta);
  });

  it("draw between unequal ratings shifts toward equilibrium", () => {
    const draw = computeMatchElo({
      playerAId: "a",
      playerARating: 1200,
      playerBId: "b",
      playerBRating: 1600,
      winnerId: null,
    });
    // The lower-rated player gains; higher-rated player loses.
    expect(draw.playerA.delta).toBeGreaterThan(0);
    expect(draw.playerB.delta).toBeLessThan(0);
    expect(draw.playerA.delta).toBe(-draw.playerB.delta);
  });

  it("respects custom K", () => {
    const r = computeMatchElo({
      playerAId: "a",
      playerARating: 1500,
      playerBId: "b",
      playerBRating: 1500,
      winnerId: "a",
      k: 16,
    });
    expect(r.playerA.delta).toBe(8);
  });

  it("DEFAULT_K is 32, STARTING_ELO is 1200", () => {
    expect(DEFAULT_K).toBe(32);
    expect(STARTING_ELO).toBe(1200);
  });
});
