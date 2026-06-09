import { describe, expect, it } from "vitest";
import { shouldApplyLifeChanged, type LifeGuardState } from "./life-events";
import type { EventMessage } from "@/lib/realtime-schema";

function lifeEvent(
  partial: Partial<Extract<EventMessage, { type: "life_changed" }>>
): Extract<EventMessage, { type: "life_changed" }> {
  return {
    type: "life_changed",
    ts: 1_000,
    matchId: "match-1",
    gameId: "game-2",
    side: "a",
    life: 20,
    ...partial,
  };
}

describe("shouldApplyLifeChanged", () => {
  const base: LifeGuardState = {
    currentGameId: "game-2",
    lastTsA: 0,
    lastTsB: 0,
  };

  it("applies a fresh event for the current game", () => {
    expect(shouldApplyLifeChanged(base, lifeEvent({ ts: 1_000 }))).toBe(true);
  });

  it("rejects a replayed event from a previous game of the same match", () => {
    // The exact reconnect bug: game 1 ended at 0 life, game_complete (structural)
    // was filtered out of the replay, and game 1's life events replay against
    // game 2's display. Same matchId, different gameId.
    const stale = lifeEvent({ gameId: "game-1", life: 0, ts: 500 });
    expect(shouldApplyLifeChanged(base, stale)).toBe(false);
  });

  it("rejects an out-of-order event older than the last applied (per side)", () => {
    const state: LifeGuardState = { ...base, lastTsA: 2_000 };
    expect(shouldApplyLifeChanged(state, lifeEvent({ ts: 1_500 }))).toBe(false);
    // ...but a newer one still applies, and the other side is independent.
    expect(shouldApplyLifeChanged(state, lifeEvent({ ts: 2_500 }))).toBe(true);
    expect(
      shouldApplyLifeChanged(state, lifeEvent({ side: "b", ts: 100 }))
    ).toBe(true);
  });

  it("applies an ascending replay sequence in order and settles correct", () => {
    // Simulate the in-game replay: events arrive ascending; each accepted one
    // advances the per-side baseline, so the sequence converges to the latest.
    let lastTsA = 0;
    const replay = [18, 15, 12].map((life, i) =>
      lifeEvent({ ts: 100 * (i + 1), life })
    );
    const applied: number[] = [];
    for (const msg of replay) {
      if (
        shouldApplyLifeChanged({ ...base, lastTsA }, msg)
      ) {
        applied.push(msg.life);
        lastTsA = msg.ts;
      }
    }
    expect(applied).toEqual([18, 15, 12]);
    // A duplicate replay of the first (older ts) is now dropped.
    expect(
      shouldApplyLifeChanged({ ...base, lastTsA }, lifeEvent({ ts: 100, life: 18 }))
    ).toBe(false);
  });

  it("skips the game-id check when the current game is unknown", () => {
    const unknown: LifeGuardState = { ...base, currentGameId: null };
    expect(
      shouldApplyLifeChanged(unknown, lifeEvent({ gameId: "anything" }))
    ).toBe(true);
  });
});
