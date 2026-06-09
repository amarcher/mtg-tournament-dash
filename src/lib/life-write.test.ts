import { describe, expect, it } from "vitest";
import { checkLifeWrite } from "./life-write";

describe("checkLifeWrite", () => {
  const active = { activeGameId: "game-2", storedLife: 20 };

  it("accepts a write matching the active game and expected life", () => {
    expect(
      checkLifeWrite(active, { gameId: "game-2", expectedLife: 20 })
    ).toEqual({ ok: true });
  });

  it("rejects when there is no active game", () => {
    expect(
      checkLifeWrite(
        { activeGameId: null, storedLife: null },
        { gameId: "game-2", expectedLife: 20 }
      )
    ).toEqual({ ok: false, reason: "no_active_game" });
  });

  it("rejects a delta computed against a previous game", () => {
    // Stale cross-game tap. Crucially this is caught even though the life
    // value (20) coincidentally matches the new game's starting life.
    expect(
      checkLifeWrite(active, { gameId: "game-1", expectedLife: 20 })
    ).toEqual({ ok: false, reason: "stale_game" });
  });

  it("rejects a stale / duplicated write whose expected life no longer holds", () => {
    // e.g. the other phone already moved this side, or this is a retry of an
    // already-applied delta.
    expect(
      checkLifeWrite(active, { gameId: "game-2", expectedLife: 19 })
    ).toEqual({ ok: false, reason: "stale_life" });
  });

  it("accepts life 0 (not treated as missing)", () => {
    expect(
      checkLifeWrite(
        { activeGameId: "game-2", storedLife: 0 },
        { gameId: "game-2", expectedLife: 0 }
      )
    ).toEqual({ ok: true });
  });
});
