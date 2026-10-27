/**
 * Round clock arithmetic shared by the TV timer and the phone's small
 * indicator. Pure: feed it the round's start, the round length, and "now".
 */

/** Extra turns after time is called: turn 0 is the one in progress, then 1–5. */
export const MAX_TIME_TURN = 5;

export interface RoundClock {
  /** Seconds left; negative once the round is in overtime. */
  remaining: number;
  overtime: boolean;
  /** Under five minutes left and not yet over. */
  lowTime: boolean;
}

export function roundClock(
  startedAtMs: number,
  durationSec: number,
  nowMs: number
): RoundClock {
  const elapsedSec = Math.floor((nowMs - startedAtMs) / 1000);
  const remaining = durationSec - elapsedSec;
  const overtime = remaining < 0;
  return { remaining, overtime, lowTime: !overtime && remaining < 5 * 60 };
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Clamp a requested extra-turn number into the legal 0..MAX range. */
export function clampTimeTurn(turn: number): number {
  if (!Number.isFinite(turn)) return 0;
  return Math.min(MAX_TIME_TURN, Math.max(0, Math.trunc(turn)));
}
