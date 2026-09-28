import { describe, it, expect } from "vitest";
import { draftSeatOrder } from "./draft-seating";

describe("draftSeatOrder", () => {
  it("seats each round-1 pair directly across an 8-player pod", () => {
    const seats = draftSeatOrder([
      { tableNumber: 2, playerAId: "c", playerBId: "d" },
      { tableNumber: 1, playerAId: "a", playerBId: "b" },
      { tableNumber: 3, playerAId: "e", playerBId: "f" },
      { tableNumber: 4, playerAId: "g", playerBId: "h" },
    ]);
    expect(seats).toEqual(["a", "c", "e", "g", "b", "d", "f", "h"]);
    for (let i = 0; i < 4; i++) {
      expect(seats.indexOf(seats[i]) + 4).toBe(seats.indexOf(seats[i + 4]));
    }
  });

  it("gives the bye player the leftover seat without breaking the pairs", () => {
    const seats = draftSeatOrder([
      { tableNumber: 1, playerAId: "bye", playerBId: null },
      { tableNumber: 2, playerAId: "a", playerBId: "b" },
      { tableNumber: 3, playerAId: "c", playerBId: "d" },
    ]);
    expect(seats).toEqual(["a", "c", "bye", "b", "d"]);
  });

  it("returns no seats for no pairings", () => {
    expect(draftSeatOrder([])).toEqual([]);
  });
});
