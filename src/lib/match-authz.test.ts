import { describe, expect, it } from "vitest";
import { isMatchParticipant } from "./match-authz";

describe("isMatchParticipant", () => {
  it("allows player A", () => {
    expect(isMatchParticipant("a", "a", "b")).toBe(true);
  });

  it("allows player B", () => {
    expect(isMatchParticipant("b", "a", "b")).toBe(true);
  });

  it("rejects a non-participant", () => {
    expect(isMatchParticipant("c", "a", "b")).toBe(false);
  });

  it("rejects an unauthenticated caller", () => {
    expect(isMatchParticipant(null, "a", "b")).toBe(false);
    expect(isMatchParticipant(undefined, "a", "b")).toBe(false);
  });

  it("handles a bye match (no player B)", () => {
    expect(isMatchParticipant("a", "a", null)).toBe(true);
    expect(isMatchParticipant("c", "a", null)).toBe(false);
  });
});
