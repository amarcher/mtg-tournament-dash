import { describe, expect, it } from "vitest";
import {
  clampTimeTurn,
  formatClock,
  MAX_TIME_TURN,
  roundClock,
} from "./round-clock";

describe("roundClock", () => {
  const start = 1_000_000;
  it("counts down from the full duration at start", () => {
    expect(roundClock(start, 3000, start)).toEqual({
      remaining: 3000,
      overtime: false,
      lowTime: false,
    });
  });
  it("flags low time under five minutes", () => {
    const c = roundClock(start, 3000, start + (3000 - 299) * 1000);
    expect(c.remaining).toBe(299);
    expect(c.lowTime).toBe(true);
    expect(c.overtime).toBe(false);
  });
  it("is not overtime at exactly zero, is one second later", () => {
    expect(roundClock(start, 60, start + 60_000).overtime).toBe(false);
    const over = roundClock(start, 60, start + 61_000);
    expect(over.overtime).toBe(true);
    expect(over.remaining).toBe(-1);
    expect(over.lowTime).toBe(false);
  });
});

describe("formatClock", () => {
  it("renders mm:ss and never goes negative", () => {
    expect(formatClock(3000)).toBe("50:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(-4)).toBe("00:00");
  });
});

describe("clampTimeTurn", () => {
  it("keeps turns inside 0..MAX", () => {
    expect(clampTimeTurn(-1)).toBe(0);
    expect(clampTimeTurn(3)).toBe(3);
    expect(clampTimeTurn(MAX_TIME_TURN + 2)).toBe(MAX_TIME_TURN);
    expect(clampTimeTurn(2.7)).toBe(2);
    expect(clampTimeTurn(NaN)).toBe(0);
  });
});
