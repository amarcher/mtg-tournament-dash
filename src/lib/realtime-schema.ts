import { z } from "zod";

// Event schemas used by `@upstash/realtime`. Mirrors the EventMessage union
// in pubsub.ts so the discriminated-union shape on call sites stays stable.
//
// Each entry's name is the channel "event" identifier; the Zod object is the
// payload. We emit on a per-tournament channel (`event:<eventId>`) so events
// from one tournament never bleed into another's subscribers.
//
// `ts` is publish-time wall clock (ms). The SSE route uses it to drop
// historical structural-event replays on reconnect — without it, every
// reconnect re-fires `round_started` / `match_complete` from Upstash history
// and the client re-runs `window.location.reload()` in an infinite loop.
export const realtimeSchema = {
  round_started: z.object({ ts: z.number(), roundNumber: z.number() }),
  round_completed: z.object({ ts: z.number(), roundNumber: z.number() }),
  event_state_changed: z.object({
    ts: z.number(),
    status: z.enum(["active", "complete"]),
  }),
  life_changed: z.object({
    ts: z.number(),
    matchId: z.string(),
    gameId: z.string(),
    side: z.enum(["a", "b"]),
    life: z.number(),
  }),
  game_complete: z.object({
    ts: z.number(),
    matchId: z.string(),
    winnerId: z.string(),
    nextGameNumber: z.number(),
    // Id of the freshly-created next game. The phone view adopts this
    // immediately so its life-event guard accepts the new game's events
    // without waiting for the next state poll. See src/lib/life-events.ts.
    newGameId: z.string(),
  }),
  match_complete: z.object({
    ts: z.number(),
    matchId: z.string(),
    winnerId: z.string(),
  }),
  // Organizer undid a recorded result — the match is back in progress and
  // the two phones showing "You won/lost" need to rejoin the game.
  match_reopened: z.object({ ts: z.number(), matchId: z.string() }),
  // Bonus games (casual matches outside rounds). `opened` fires on the event
  // channel when a game is created from a waiting room, so waiting phones
  // re-render their join list. `started` fires on the match channel when seat
  // B is claimed (the creator's QR screen flips into the scorekeeper) — and,
  // after a finished game, on the *old* match's channel carrying the new
  // matchId so both phones follow into the next bonus game. `ended` replaces
  // match_complete for bonus games, which have no winner requirement.
  bonus_game_opened: z.object({ ts: z.number(), matchId: z.string() }),
  bonus_game_started: z.object({ ts: z.number(), matchId: z.string() }),
  bonus_game_ended: z.object({ ts: z.number(), matchId: z.string() }),
} as const;

export const REALTIME_EVENT_NAMES = [
  "round_started",
  "round_completed",
  "event_state_changed",
  "life_changed",
  "game_complete",
  "match_complete",
  "match_reopened",
  "bonus_game_opened",
  "bonus_game_started",
  "bonus_game_ended",
] as const;

export type RealtimeEventName = (typeof REALTIME_EVENT_NAMES)[number];

// Type used by call sites (publishers + subscribers). Discriminated union
// keyed on `type`, identical in shape to what existed before Realtime.
// `ts` is set inside `publish()` — callers pass `Omit<EventMessage, "ts">`.
export type EventMessage =
  | { type: "round_started"; ts: number; roundNumber: number }
  | { type: "round_completed"; ts: number; roundNumber: number }
  | {
      type: "event_state_changed";
      ts: number;
      status: "active" | "complete";
    }
  | {
      type: "life_changed";
      ts: number;
      matchId: string;
      gameId: string;
      side: "a" | "b";
      life: number;
    }
  | {
      type: "game_complete";
      ts: number;
      matchId: string;
      winnerId: string;
      nextGameNumber: number;
      newGameId: string;
    }
  | { type: "match_complete"; ts: number; matchId: string; winnerId: string }
  | { type: "match_reopened"; ts: number; matchId: string }
  | { type: "bonus_game_opened"; ts: number; matchId: string }
  | { type: "bonus_game_started"; ts: number; matchId: string }
  | { type: "bonus_game_ended"; ts: number; matchId: string };

// Event types that trigger a hard reload on the client. The SSE route drops
// any of these whose `ts` predates the client's connection, so reconnects
// don't replay an old `round_started` and put the page into a reload loop.
export const STRUCTURAL_EVENT_TYPES: ReadonlySet<EventMessage["type"]> = new Set([
  "round_started",
  "round_completed",
  "event_state_changed",
  "match_complete",
  "match_reopened",
  "game_complete",
  "bonus_game_opened",
  "bonus_game_started",
  "bonus_game_ended",
]);

// Channel-name helpers. Centralizing these so producer/consumer can't drift.
export function channelForEvent(eventId: string): string {
  return `event:${eventId}`;
}

// Bonus games have no event to anchor to, so they get their own channel.
export function channelForMatch(matchId: string): string {
  return `match:${matchId}`;
}
