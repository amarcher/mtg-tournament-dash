import { describe, expect, it } from "vitest";
import {
  buildEventBonusOpponents,
  IN_EVENT_GROUP,
  OTHER_LEAGUE_GROUP,
} from "./bonus-opponents";

describe("buildEventBonusOpponents", () => {
  const roster = [
    { playerId: "me", displayName: "Me" },
    { playerId: "r2", displayName: "Zed" },
    { playerId: "r1", displayName: "Amy" },
  ];
  const leaguePlayers = [
    { id: "me", displayName: "Me" },
    { id: "r1", displayName: "Amy" },
    { id: "r2", displayName: "Zed" },
    { id: "o2", displayName: "Walt" },
    { id: "o1", displayName: "Bea" },
  ];

  it("lists event players first in roster order, then other league wizards alphabetically", () => {
    const result = buildEventBonusOpponents({
      me: "me",
      roster,
      leaguePlayers,
      busyIds: new Set(),
    });
    expect(result.map((o) => [o.playerId, o.group])).toEqual([
      ["r2", IN_EVENT_GROUP],
      ["r1", IN_EVENT_GROUP],
      ["o1", OTHER_LEAGUE_GROUP],
      ["o2", OTHER_LEAGUE_GROUP],
    ]);
  });

  it("excludes the caller even when they aren't on the roster", () => {
    const result = buildEventBonusOpponents({
      me: "o1",
      roster,
      leaguePlayers,
      busyIds: new Set(),
    });
    expect(result.map((o) => o.playerId)).not.toContain("o1");
    expect(result.map((o) => o.playerId)).toContain("me");
  });

  it("marks busy players in both groups", () => {
    const result = buildEventBonusOpponents({
      me: "me",
      roster,
      leaguePlayers,
      busyIds: new Set(["r1", "o2"]),
    });
    const busy = result.filter((o) => o.busy).map((o) => o.playerId);
    expect(busy.sort()).toEqual(["o2", "r1"]);
  });
});
