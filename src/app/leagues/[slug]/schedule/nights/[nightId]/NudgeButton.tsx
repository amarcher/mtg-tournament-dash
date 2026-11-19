"use client";

import { useActionState } from "react";
import {
  nudgeNightRsvpsAction,
  type RsvpNudgeFormState,
} from "@/app/events/actions";

const initialState: RsvpNudgeFormState = { status: "idle", error: null };

/**
 * Organizer's reminder to the players who have not answered this night.
 * `reachable` is how many of them have a phone that will hear it, so a
 * nudge that lands nowhere is never a surprise.
 */
export function NudgeButton({
  nightId,
  silentCount,
  reachable,
}: {
  nightId: string;
  silentCount: number;
  reachable: number;
}) {
  const [state, formAction, pending] = useActionState(
    nudgeNightRsvpsAction,
    initialState
  );
  const phones = (n: number) => `${n} ${n === 1 ? "phone" : "phones"}`;

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="nightId" value={nightId} />
      <button
        type="submit"
        disabled={pending || reachable === 0 || state.status === "sent"}
        className="min-h-11 rounded-full border border-amber-500/50 px-5 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500 disabled:hover:bg-transparent"
      >
        {pending
          ? "Nudging…"
          : silentCount === 1
            ? "Nudge the one who hasn't answered"
            : `Nudge the ${silentCount} who haven't answered`}
      </button>
      {state.status === "idle" && (
        <p className="mt-2 text-xs text-zinc-500">
          {reachable === 0
            ? "None of them has the app with schedule notifications on, so a nudge would reach no one. Share the link instead."
            : reachable === silentCount
              ? "Sends a notification to each of them."
              : `A notification reaches ${reachable} of them; the rest don't have the app with schedule notifications on.`}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {state.error}
        </p>
      )}
      {state.status === "sent" && (
        <p role="status" className="mt-2 text-xs text-emerald-300">
          Nudged {phones(state.sent)}.
          {state.optedOut > 0 &&
            ` ${phones(state.optedOut)} had schedule notifications off.`}
          {state.failed > 0 && ` ${state.failed} could not be delivered.`}
        </p>
      )}
    </form>
  );
}
