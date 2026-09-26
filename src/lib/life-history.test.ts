import { describe, expect, it } from "vitest";
import {
  MERGE_WINDOW_MS,
  emptyHistory,
  parseStoredHistory,
  recordLifeChange,
} from "./life-history";

describe("recordLifeChange", () => {
  it("merges quick taps on the same side into one entry", () => {
    let h = emptyHistory("g1");
    h = recordLifeChange(h, "a", 20, 19, 1000);
    h = recordLifeChange(h, "a", 19, 18, 1500);
    h = recordLifeChange(h, "a", 18, 15, 2000);
    expect(h.entries).toEqual([
      { side: "a", from: 20, to: 15, at: 1000, lastAt: 2000 },
    ]);
  });

  it("starts a new entry after the merge window or on the other side", () => {
    let h = emptyHistory("g1");
    h = recordLifeChange(h, "a", 20, 17, 0);
    h = recordLifeChange(h, "b", 20, 18, 100);
    h = recordLifeChange(h, "a", 17, 14, 200);
    h = recordLifeChange(h, "a", 14, 12, 200 + MERGE_WINDOW_MS + 1);
    expect(h.entries.map((e) => [e.side, e.from, e.to])).toEqual([
      ["a", 20, 17],
      ["b", 20, 18],
      ["a", 17, 14],
      ["a", 14, 12],
    ]);
  });

  it("drops a run that returns to where it started", () => {
    let h = emptyHistory("g1");
    h = recordLifeChange(h, "b", 20, 19, 0);
    h = recordLifeChange(h, "b", 19, 20, 500);
    expect(h.entries).toEqual([]);
  });

  it("ignores no-op changes", () => {
    const h = recordLifeChange(emptyHistory("g1"), "a", 20, 20, 0);
    expect(h.entries).toEqual([]);
  });
});

describe("parseStoredHistory", () => {
  it("keeps a history for the same game and discards other games", () => {
    const stored = JSON.stringify({
      gameId: "g1",
      entries: [{ side: "a", from: 20, to: 18, at: 1, lastAt: 1 }],
    });
    expect(parseStoredHistory(stored, "g1").entries).toHaveLength(1);
    expect(parseStoredHistory(stored, "g2").entries).toEqual([]);
    expect(parseStoredHistory("not json", "g1").entries).toEqual([]);
    expect(parseStoredHistory(null, "g1").entries).toEqual([]);
  });
});
