import { describe, it, expect } from "vitest";
import { outcomeAtTime } from "./time-call";

describe("outcomeAtTime", () => {
  it("gives a 1-0 lead the match when game 2 is cut off", () => {
    expect(outcomeAtTime(1, 0)).toBe("a");
    expect(outcomeAtTime(0, 1)).toBe("b");
  });

  it("calls 1-1 with game 3 cut off a draw", () => {
    expect(outcomeAtTime(1, 1)).toBe("draw");
  });

  it("calls a match with no finished games a draw", () => {
    expect(outcomeAtTime(0, 0)).toBe("draw");
  });
});
