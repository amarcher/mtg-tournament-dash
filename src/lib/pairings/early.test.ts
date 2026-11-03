import { describe, it, expect } from "vitest";
import {
  earlyLockBlocker,
  lockablePlayers,
  type EarlyLockContext,
} from "./early";

const seat = (playerId: string, dropped = false) => ({
  playerId,
  droppedAt: dropped ? new Date() : null,
});

describe("lockablePlayers", () => {
  const roster = ["a", "b", "c", "d", "e", "f"].map((id) => seat(id));

  it("leaves out players still at a table, dropped players and next-round seats", () => {
    const running = [{ playerAId: "a", playerBId: "b" }];
    const next = [{ playerAId: "c", playerBId: "d" }];
    const ids = lockablePlayers(
      [...roster.slice(0, 5), seat("f", true)],
      running,
      next
    ).map((p) => p.playerId);
    expect(ids).toEqual(["e"]);
  });

  it("frees everyone when nothing is running", () => {
    expect(lockablePlayers(roster, [], []).map((p) => p.playerId)).toEqual([
      "a", "b", "c", "d", "e", "f",
    ]);
  });
});

describe("earlyLockBlocker", () => {
  const ctx: EarlyLockContext = {
    format: "swiss",
    eventStatus: "active",
    nextRoundNumber: 2,
    totalRounds: 3,
  };
  const lockable = new Set(["a", "b", "c"]);

  it("allows two free players in a running Swiss event", () => {
    expect(earlyLockBlocker(ctx, lockable, "a", "b")).toBeNull();
  });

  it("names the event-level blocker first", () => {
    expect(earlyLockBlocker({ ...ctx, format: "team_draft" }, lockable, "a", "b"))
      .toMatch(/Swiss/);
    expect(earlyLockBlocker({ ...ctx, eventStatus: "complete" }, lockable, "a", "b"))
      .toMatch(/complete/);
    expect(earlyLockBlocker({ ...ctx, eventStatus: "draft" }, lockable, "a", "b"))
      .toMatch(/round 1/);
    expect(
      earlyLockBlocker({ ...ctx, nextRoundNumber: 4 }, lockable, "a", "b")
    ).toMatch(/All rounds/);
  });

  it("rejects the same player twice and anyone not lockable", () => {
    expect(earlyLockBlocker(ctx, lockable, "a", "a")).toMatch(/themselves/);
    expect(earlyLockBlocker(ctx, lockable, "a", "z")).toMatch(/finished/);
    expect(earlyLockBlocker(ctx, lockable, "", "a")).toMatch(/two players/);
  });
});
