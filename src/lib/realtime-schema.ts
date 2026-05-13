import { z } from "zod";

// Event schemas used by `@upstash/realtime`. Mirrors the EventMessage union
// in pubsub.ts so the discriminated-union shape on call sites stays stable.
//
// Each entry's name is the channel "event" identifier; the Zod object is the
// payload. We emit on a per-tournament channel (`event:<eventId>`) so events
// from one tournament never bleed into another's subscribers.
export const realtimeSchema = {
  round_started: z.object({ roundNumber: z.number() }),
  round_completed: z.object({ roundNumber: z.number() }),
  life_changed: z.object({
    matchId: z.string(),
    gameId: z.string(),
    side: z.enum(["a", "b"]),
    life: z.number(),
  }),
  game_complete: z.object({
    matchId: z.string(),
    winnerId: z.string(),
    nextGameNumber: z.number(),
  }),
  match_complete: z.object({
    matchId: z.string(),
    winnerId: z.string(),
  }),
} as const;

export const REALTIME_EVENT_NAMES = [
  "round_started",
  "round_completed",
  "life_changed",
  "game_complete",
  "match_complete",
] as const;

export type RealtimeEventName = (typeof REALTIME_EVENT_NAMES)[number];

// Type used by call sites (publishers + subscribers). Discriminated union
// keyed on `type`, identical in shape to what existed before Realtime.
export type EventMessage =
  | { type: "round_started"; roundNumber: number }
  | { type: "round_completed"; roundNumber: number }
  | {
      type: "life_changed";
      matchId: string;
      gameId: string;
      side: "a" | "b";
      life: number;
    }
  | {
      type: "game_complete";
      matchId: string;
      winnerId: string;
      nextGameNumber: number;
    }
  | { type: "match_complete"; matchId: string; winnerId: string };

// Channel-name helper. Centralizing this so producer/consumer can't drift.
export function channelForEvent(eventId: string): string {
  return `event:${eventId}`;
}
