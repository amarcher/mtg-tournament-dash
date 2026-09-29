import { describe, it, expect } from "vitest";
import { validateManualPairings } from "./manual";

const active = new Set(["a", "b", "c", "d", "e"]);

describe("validateManualPairings", () => {
  it("accepts full pairings with one bye", () => {
    expect(() =>
      validateManualPairings(
        [
          { playerAId: "a", playerBId: "d" },
          { playerAId: "b", playerBId: "c" },
          { playerAId: "e", playerBId: null },
        ],
        active
      )
    ).not.toThrow();
  });

  it("allows leaving players unpaired", () => {
    expect(() =>
      validateManualPairings([{ playerAId: "a", playerBId: "b" }], active)
    ).not.toThrow();
  });

  it("rejects an empty round", () => {
    expect(() => validateManualPairings([], active)).toThrow(/at least one/);
  });

  it("rejects seating a player twice", () => {
    expect(() =>
      validateManualPairings(
        [
          { playerAId: "a", playerBId: "b" },
          { playerAId: "b", playerBId: "c" },
        ],
        active
      )
    ).toThrow(/one table/);
    expect(() =>
      validateManualPairings([{ playerAId: "a", playerBId: "a" }], active)
    ).toThrow(/one table/);
  });

  it("rejects players not active on the roster", () => {
    expect(() =>
      validateManualPairings([{ playerAId: "a", playerBId: "zz" }], active)
    ).toThrow(/roster/);
  });

  it("rejects more than one bye", () => {
    expect(() =>
      validateManualPairings(
        [
          { playerAId: "a", playerBId: null },
          { playerAId: "b", playerBId: null },
        ],
        active
      )
    ).toThrow(/one player can have the bye/);
  });
});
