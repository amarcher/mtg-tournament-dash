"use client";

import { useActionState } from "react";
import {
  createBonusGameAction,
  type BonusGameFormState,
} from "@/app/events/actions";

const initialState: BonusGameFormState = { error: null };

/**
 * Challenge form for bonus games. Busy wizards stay listed but disabled so
 * the "already in a bonus game" rule is visible before submit, and any server
 * rejection renders inline instead of navigating to an error page.
 */
export function BonusGameForm({
  leagueSlug,
  eventId,
  opponents,
  idPrefix,
}: {
  leagueSlug: string;
  eventId?: string;
  opponents: { playerId: string; displayName: string; busy: boolean }[];
  idPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(
    createBonusGameAction,
    initialState
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="leagueSlug" value={leagueSlug} />
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      <label htmlFor={`${idPrefix}-opponent`} className="sr-only">
        Opponent
      </label>
      <select
        id={`${idPrefix}-opponent`}
        name="opponentId"
        defaultValue=""
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-base"
      >
        <option value="">Anyone — show a QR code</option>
        {opponents.map((o) => (
          <option key={o.playerId} value={o.playerId} disabled={o.busy}>
            {o.busy ? `${o.displayName} — mid-game` : o.displayName}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <label htmlFor={`${idPrefix}-life`} className="sr-only">
          Starting life
        </label>
        <select
          id={`${idPrefix}-life`}
          name="startingLife"
          defaultValue="20"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-base"
        >
          <option value="20">20 life</option>
          <option value="40">40 life</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed disabled:bg-amber-500/40"
        >
          {pending ? "Starting…" : "Start a Bonus Game"}
        </button>
      </div>
      {state.error && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {state.error}
        </p>
      )}
    </form>
  );
}
