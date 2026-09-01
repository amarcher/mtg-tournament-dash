"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearMatchResultAction,
  setMatchResultAction,
} from "@/app/events/actions";

/**
 * Two-tap confirm: the first tap arms the button (label flips to spell out
 * the consequence), the second submits. Disarms itself after a beat. Exists
 * because a one-tap "X wins" finalized a live match mid-game on draft night —
 * these buttons are real overrides, not hypotheticals.
 */
function useArmed(timeoutMs = 5000) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arm = () => {
    setArmed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(false), timeoutMs);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  return { armed, arm };
}

export function ResultButton({
  matchId,
  outcome,
  label,
  variant,
}: {
  matchId: string;
  outcome: "a" | "b" | "draw";
  label: string;
  variant?: "muted";
}) {
  const { armed, arm } = useArmed();
  return (
    <form
      action={setMatchResultAction}
      onSubmit={(e) => {
        if (!armed) {
          e.preventDefault();
          arm();
        }
      }}
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="outcome" value={outcome} />
      <button
        type="submit"
        className={
          armed
            ? "w-full rounded-md bg-rose-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 sm:w-auto"
            : variant === "muted"
              ? "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 sm:w-auto"
              : "w-full rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 sm:w-auto"
        }
      >
        {armed ? "Tap again — ends the match for the table" : label}
      </button>
    </form>
  );
}

export function UndoResultButton({ matchId }: { matchId: string }) {
  const { armed, arm } = useArmed();
  return (
    <form
      action={clearMatchResultAction}
      onSubmit={(e) => {
        if (!armed) {
          e.preventDefault();
          arm();
        }
      }}
    >
      <input type="hidden" name="matchId" value={matchId} />
      <button
        type="submit"
        className={
          armed
            ? "rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
            : "rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        }
      >
        {armed ? "Tap again — reverts ELO, reopens the match" : "Undo result"}
      </button>
    </form>
  );
}
