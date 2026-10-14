import { MERGE_WINDOW_MS } from "./life-history";
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

/**
 * How long one player's edit to a life total holds the other phone's buttons
 * for that total. Same span the life history treats as "one change", so a
 * lock lasts exactly as long as the edit it protects is still open.
 */
export const REMOTE_EDIT_LOCK_MS = MERGE_WINDOW_MS;

/**
 * How long (ms) to lock this phone's buttons for `msg.side` because the other
 * player is editing that total. 0 = don't lock: our own echo, a trusted
 * server write, or an old event (the SSE reconnect replay re-delivers up to
 * ~50 past life events, which must not freeze the scorekeeper).
 */
export function remoteEditLockMs(
  msg: LifeChanged,
  mySide: "a" | "b",
  now: number
): number {
  if (!msg.by || msg.by === mySide) return 0;
  // A phone clock running behind the server reads a live event as "from the
  // future"; treat that as just-now rather than extending the lock.
  const age = Math.max(0, now - msg.ts);
  return Math.max(0, REMOTE_EDIT_LOCK_MS - age);
}
