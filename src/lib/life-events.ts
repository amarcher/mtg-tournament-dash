import type { EventMessage } from "@/lib/realtime-schema";

type LifeChanged = Extract<EventMessage, { type: "life_changed" }>;

/**
 * Per-match guard state for incoming `life_changed` events.
 *
 * - `currentGameId`: the active game id for this match per the server's latest
 *   authoritative read (SSR'd initial state, then the polling reconcile). When
 *   `null`, the game-id check is skipped (we don't yet know which game is live).
 * - `lastTsA` / `lastTsB`: publish-time `ts` (ms) of the last life event we
 *   applied for each side, used to reject out-of-order / replayed deliveries.
 */
export type LifeGuardState = {
  currentGameId: string | null;
  lastTsA: number;
  lastTsB: number;
};

/**
 * Decide whether an incoming `life_changed` should update local life state.
 *
 * Why this exists: on every SSE (re)connect the stream route replays up to
 * ~50 history events from Upstash. `life_changed` is intentionally NOT in
 * `STRUCTURAL_EVENT_TYPES`, so unlike `round_started` / `game_complete` it is
 * replayed without the `ts < connectedAt` drop. Those replayed events include
 * stale life totals from earlier in this game and from *previous games of the
 * same match* — and the resetting `game_complete` that would have undone them
 * IS structural, so it gets filtered out of the replay and never runs. Keyed
 * only on `matchId`, a reconnecting client therefore re-applies a prior game's
 * dying life total with no user action, until the next poll corrects it.
 *
 * Guard: only apply a life event that (a) belongs to the current game and
 * (b) is at least as new as the last event we applied for that side. Callers
 * are responsible for updating `lastTsA` / `lastTsB` to `msg.ts` when they act
 * on the event.
 */
export function shouldApplyLifeChanged(
  state: LifeGuardState,
  msg: LifeChanged
): boolean {
  if (state.currentGameId !== null && msg.gameId !== state.currentGameId) {
    return false;
  }
  const lastTs = msg.side === "a" ? state.lastTsA : state.lastTsB;
  return msg.ts >= lastTs;
}
