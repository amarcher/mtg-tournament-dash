import { describe, expect, it } from "vitest";
import {
  filterBonusOpponents,
  groupBonusOpponents,
  rankBonusOpponents,
  RECENT_BONUS_WINDOW_MS,
  TIER_LABELS,
  type BonusCandidatePlayer,
  type LeagueMatchActivity,
} from "./bonus-opponents";

const NOW = new Date("2026-11-01T20:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

const noAvatars = {
  avatarUrl: null,
  avatarWoundedUrl: null,
  avatarCriticalUrl: null,
  avatarVictoryUrl: null,
  avatarDefeatUrl: null,
};

function player(
  id: string,
  displayName: string,
  createdAt = ago(400)
): BonusCandidatePlayer {
  return { id, displayName, createdAt, ...noAvatars };
}

function bonus(
  a: string,
  b: string | null,
  at: Date,
  status: LeagueMatchActivity["status"] = "complete"
): LeagueMatchActivity {
  return {
    playerAId: a,
    playerBId: b,
    roundId: null,
    eventId: null,
    roundStatus: null,
    status,
    createdAt: at,
    completedAt: status === "complete" ? at : null,
  };
}

function tournament(
  a: string,
  b: string | null,
  opts: {
    eventId: string;
    status: LeagueMatchActivity["status"];
    roundStatus: NonNullable<LeagueMatchActivity["roundStatus"]>;
    at?: Date;
  }
): LeagueMatchActivity {
  const at = opts.at ?? ago(0);
  return {
    playerAId: a,
    playerBId: b,
    roundId: "round",
    eventId: opts.eventId,
    roundStatus: opts.roundStatus,
    status: opts.status,
    createdAt: at,
    completedAt: opts.status === "complete" ? at : null,
  };
}

const EVENT = "event-1";

describe("rankBonusOpponents", () => {
  const players = [
    player("me", "Me"),
    player("zed", "Zed"),
    player("amy", "Amy"),
    player("bea", "Bea"),
    player("cal", "Cal"),
    player("dot", "Dot"),
    player("eve", "Eve"),
    player("fay", "Fay", ago(2)),
    player("gus", "Gus", ago(5)),
  ];
  const roster = [
    { playerId: "me" },
    { playerId: "zed" },
    { playerId: "amy" },
    { playerId: "bea" },
    { playerId: "cal" },
  ];

  it("puts free event players first, then tied-up event players, then recent bonus players, then everyone else", () => {
    const activity: LeagueMatchActivity[] = [
      tournament("bea", "me", { eventId: EVENT, status: "in_progress", roundStatus: "active" }),
      bonus("cal", "dot", ago(1), "in_progress"),
      bonus("eve", "gus", ago(3)),
    ];
    const result = rankBonusOpponents({
      me: "me",
      players,
      eventRoster: roster,
      eventId: EVENT,
      activity,
      busyIds: new Set(["cal", "dot"]),
      now: NOW,
    });
    expect(result.map((o) => [o.playerId, o.tier])).toEqual([
      ["amy", 1],
      ["zed", 1],
      ["bea", 2],
      ["cal", 2],
      ["eve", 3],
      ["gus", 3],
      ["dot", 4],
      ["fay", 4],
    ]);
    expect(result.find((o) => o.playerId === "cal")?.busy).toBe(true);
    expect(result.find((o) => o.playerId === "bea")?.busy).toBe(false);
    expect(result.every((o) => o.group === TIER_LABELS[o.tier])).toBe(true);
  });

  it("sorts everyone-else by most recent match, then by when they joined", () => {
    const activity: LeagueMatchActivity[] = [
      tournament("dot", "eve", { eventId: "old-event", status: "complete", roundStatus: "complete", at: ago(40) }),
      bonus("gus", "fay", ago(35)),
    ];
    const result = rankBonusOpponents({
      me: "me",
      players: players.filter((p) => ["me", "dot", "eve", "fay", "gus"].includes(p.id)),
      eventRoster: [],
      eventId: null,
      activity,
      busyIds: new Set(),
      now: NOW,
    });
    expect(result.map((o) => o.playerId)).toEqual(["fay", "gus", "dot", "eve"]);
    expect(result.every((o) => o.tier === 4)).toBe(true);
  });

  it("counts a bonus game as recent only inside the window", () => {
    const edge = new Date(NOW.getTime() - RECENT_BONUS_WINDOW_MS);
    const activity: LeagueMatchActivity[] = [
      bonus("dot", "me", edge),
      bonus("eve", "me", new Date(edge.getTime() - 1)),
    ];
    const result = rankBonusOpponents({
      me: "me",
      players: players.filter((p) => ["me", "dot", "eve"].includes(p.id)),
      eventRoster: [],
      eventId: null,
      activity,
      busyIds: new Set(),
      now: NOW,
    });
    expect(result.map((o) => [o.playerId, o.tier])).toEqual([
      ["dot", 3],
      ["eve", 4],
    ]);
  });

  it("treats a pending match in the active round as tied up, but not one in a pending round", () => {
    const activity: LeagueMatchActivity[] = [
      tournament("amy", "zed", { eventId: EVENT, status: "pending", roundStatus: "active" }),
      tournament("bea", "cal", { eventId: EVENT, status: "pending", roundStatus: "pending" }),
    ];
    const result = rankBonusOpponents({
      me: "me",
      players,
      eventRoster: roster,
      eventId: EVENT,
      activity,
      busyIds: new Set(),
      now: NOW,
    });
    const tierOf = (id: string) => result.find((o) => o.playerId === id)?.tier;
    expect(tierOf("amy")).toBe(2);
    expect(tierOf("zed")).toBe(2);
    expect(tierOf("bea")).toBe(1);
    expect(tierOf("cal")).toBe(1);
  });

  it("ignores running matches from other events", () => {
    const activity: LeagueMatchActivity[] = [
      tournament("amy", "zed", { eventId: "other", status: "in_progress", roundStatus: "active" }),
    ];
    const result = rankBonusOpponents({
      me: "me",
      players,
      eventRoster: roster,
      eventId: EVENT,
      activity,
      busyIds: new Set(),
      now: NOW,
    });
    expect(result.find((o) => o.playerId === "amy")?.tier).toBe(1);
  });

  it("excludes the caller and carries all five portrait tiers", () => {
    const result = rankBonusOpponents({
      me: "me",
      players: [
        player("me", "Me"),
        {
          ...player("amy", "Amy"),
          avatarUrl: "fresh.jpg",
          avatarWoundedUrl: "wounded.jpg",
          avatarCriticalUrl: "critical.jpg",
          avatarVictoryUrl: "victory.jpg",
          avatarDefeatUrl: "defeat.jpg",
        },
      ],
      eventRoster: [],
      eventId: null,
      activity: [],
      busyIds: new Set(),
      now: NOW,
    });
    expect(result.map((o) => o.playerId)).toEqual(["amy"]);
    expect(result[0].avatars).toEqual({
      fresh: "fresh.jpg",
      wounded: "wounded.jpg",
      critical: "critical.jpg",
      victory: "victory.jpg",
      defeat: "defeat.jpg",
    });
  });
});

describe("filterBonusOpponents", () => {
  const list = [
    { displayName: "Zoë the Grey" },
    { displayName: "Amy" },
    { displayName: "Walt Grey" },
  ];
  it("returns everyone for an empty or blank query", () => {
    expect(filterBonusOpponents(list, "")).toEqual(list);
    expect(filterBonusOpponents(list, "   ")).toEqual(list);
  });
  it("matches case- and accent-insensitively anywhere in the name", () => {
    expect(filterBonusOpponents(list, "GREY").map((o) => o.displayName)).toEqual([
      "Zoë the Grey",
      "Walt Grey",
    ]);
    expect(filterBonusOpponents(list, "zoe").map((o) => o.displayName)).toEqual([
      "Zoë the Grey",
    ]);
  });
});

describe("groupBonusOpponents", () => {
  it("splits consecutive runs by group without reordering", () => {
    const groups = groupBonusOpponents([
      { group: "a", id: 1 },
      { group: "a", id: 2 },
      { group: "b", id: 3 },
      { group: "a", id: 4 },
    ]);
    expect(groups.map((g) => [g.group, g.members.map((m) => m.id)])).toEqual([
      ["a", [1, 2]],
      ["b", [3]],
      ["a", [4]],
    ]);
  });
});
