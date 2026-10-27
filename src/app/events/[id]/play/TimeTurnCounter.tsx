"use client";

import { useState } from "react";
import { MAX_TIME_TURN } from "@/lib/round-clock";

/**
 * Extra-turn counter shown between the life panels once the round clock
 * runs out. Turn 0 is the turn in progress when time was called; the players
 * tick it up to 5, and the last turn tells them how the game has to end.
 */
export function TimeTurnCounter({
  turn,
  onChange,
  onDraw,
  disabled,
}: {
  turn: number;
  onChange: (turn: number) => void;
  /** Null on a bye — nothing to draw. */
  onDraw: (() => void) | null;
  disabled?: boolean;
}) {
  const [drawArmed, setDrawArmed] = useState(false);
  const isFinal = turn >= MAX_TIME_TURN;

  return (
    <div
      role="group"
      aria-label={`Time called. Turn ${turn} of ${MAX_TIME_TURN}`}
      className="rounded-[12px] bg-rose-500/12 px-2 py-1.5 shadow-[inset_0_0_0_1px_rgb(251_113_133/0.35)]"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(turn - 1)}
          disabled={disabled || turn <= 0}
          aria-label="Previous turn"
          className="grid h-11 w-11 shrink-0 touch-manipulation select-none place-items-center rounded-[10px] btn-ghost text-xl disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          −
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center leading-none">
          <span className="label-caps text-rose-200">
            {isFinal ? "Final turn" : "Time called"}
          </span>
          <span className="mt-1 font-numeral text-2xl font-bold tabular-nums text-ink">
            Turn {turn}
            <span className="text-base font-semibold text-ink-dim">
              {" "}
              / {MAX_TIME_TURN}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange(turn + 1)}
          disabled={disabled || isFinal}
          aria-label="Next turn"
          className="grid h-11 w-11 shrink-0 touch-manipulation select-none place-items-center rounded-[10px] btn-gold text-xl disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          +
        </button>
      </div>
      {isFinal && (
        <div className="mt-1.5 flex items-center gap-2 px-1 pb-0.5">
          <p className="min-w-0 flex-1 text-xs leading-snug text-ink-dim">
            When this turn ends, tap who won the game — or call it a draw.
          </p>
          {onDraw && (
            <button
              type="button"
              onClick={() => {
                if (!drawArmed) {
                  setDrawArmed(true);
                  return;
                }
                setDrawArmed(false);
                onDraw();
              }}
              onBlur={() => setDrawArmed(false)}
              disabled={disabled}
              className={`h-11 shrink-0 touch-manipulation select-none rounded-[10px] px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
                drawArmed
                  ? "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/50"
                  : "btn-ghost text-rose-200"
              }`}
            >
              {drawArmed ? "Confirm draw" : "Draw"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
