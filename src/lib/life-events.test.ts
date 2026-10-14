import { describe, expect, it } from "vitest";
import {
  REMOTE_EDIT_LOCK_MS,
  remoteEditLockMs,
  shouldApplyLifeChanged,
  type LifeGuardState,
} from "./life-events";
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

describe("remoteEditLockMs", () => {
  it("locks for the full window when the opponent just edited", () => {
    const msg = lifeEvent({ by: "b", ts: 10_000 });
    expect(remoteEditLockMs(msg, "a", 10_000)).toBe(REMOTE_EDIT_LOCK_MS);
  });

  it("never locks on our own echo or an unattributed server write", () => {
    expect(remoteEditLockMs(lifeEvent({ by: "a", ts: 10_000 }), "a", 10_000)).toBe(0);
    expect(remoteEditLockMs(lifeEvent({ ts: 10_000 }), "a", 10_000)).toBe(0);
  });

  it("locks only for what is left of the window on a late delivery", () => {
    const msg = lifeEvent({ by: "b", ts: 10_000 });
    expect(remoteEditLockMs(msg, "a", 11_000)).toBe(REMOTE_EDIT_LOCK_MS - 1_000);
  });

  it("does not lock on events replayed from before the window", () => {
    const msg = lifeEvent({ by: "b", ts: 10_000 });
    expect(remoteEditLockMs(msg, "a", 10_000 + REMOTE_EDIT_LOCK_MS)).toBe(0);
    expect(remoteEditLockMs(msg, "a", 60_000)).toBe(0);
  });

  it("caps the lock at one window when the phone clock runs behind", () => {
    const msg = lifeEvent({ by: "b", ts: 10_000 });
    expect(remoteEditLockMs(msg, "a", 9_000)).toBe(REMOTE_EDIT_LOCK_MS);
  });
});
