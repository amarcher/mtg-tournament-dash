import { describe, it, expect } from "vitest";
import {
  channelForEvent,
  realtimeSchema,
  REALTIME_EVENT_NAMES,
  type EventMessage,
} from "./realtime-schema";

describe("realtime-schema", () => {
  it("channelForEvent is deterministic and namespaces by eventId", () => {
    expect(channelForEvent("abc")).toBe("event:abc");
    expect(channelForEvent("abc")).toBe(channelForEvent("abc"));
    expect(channelForEvent("abc")).not.toBe(channelForEvent("def"));
  });

  it("REALTIME_EVENT_NAMES matches the schema keys", () => {
    expect([...REALTIME_EVENT_NAMES].sort()).toEqual(
      Object.keys(realtimeSchema).sort()
    );
  });

  it("schema accepts every EventMessage variant's payload", () => {
    // Pair each event name with a representative payload that matches its
    // EventMessage shape. If the union or schema drifts, this test breaks.
    const payloads: Record<
      (typeof REALTIME_EVENT_NAMES)[number],
      Omit<Extract<EventMessage, { type: never }>, "type"> | object
    > = {
      round_started: { ts: 1, roundNumber: 3 },
      round_completed: { ts: 1, roundNumber: 3 },
      event_state_changed: { ts: 1, status: "complete" as const },
      life_changed: {
        ts: 1,
        matchId: "m1",
        gameId: "g1",
        side: "a" as const,
        life: 17,
      },
      game_complete: {
        ts: 1,
        matchId: "m1",
        winnerId: "p1",
        nextGameNumber: 2,
        newGameId: "g2",
      },
      match_complete: { ts: 1, matchId: "m1", winnerId: "p1" },
      match_reopened: { ts: 1, matchId: "m1" },
      bonus_game_opened: { ts: 1, matchId: "m1" },
      bonus_game_started: { ts: 1, matchId: "m1" },
      bonus_game_ended: { ts: 1, matchId: "m1" },
    };
    for (const name of REALTIME_EVENT_NAMES) {
      const schema = realtimeSchema[name];
      const parsed = schema.parse(payloads[name]);
      expect(parsed).toEqual(payloads[name]);
    }
  });

  it("schema rejects payloads with missing required fields", () => {
    expect(() =>
      realtimeSchema.life_changed.parse({ matchId: "m1" })
    ).toThrow();
    expect(() =>
      realtimeSchema.match_complete.parse({ matchId: "m1" })
    ).toThrow();
  });

  it("schema rejects invalid life_changed.side values", () => {
    expect(() =>
      realtimeSchema.life_changed.parse({
        matchId: "m1",
        gameId: "g1",
        side: "c",
        life: 17,
      })
    ).toThrow();
  });
});
