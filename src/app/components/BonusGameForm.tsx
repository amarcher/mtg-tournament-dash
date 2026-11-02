"use client";

import { useActionState, useState } from "react";
import {
  createBonusGameAction,
  type BonusGameFormState,
} from "@/app/events/actions";
import type { BonusOpponent } from "@/lib/bonus-opponents";
import { BonusOpponentPicker } from "./BonusOpponentPicker";

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
  opponents: BonusOpponent[];
  idPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(
    createBonusGameAction,
    initialState
  );
  const [opponentId, setOpponentId] = useState("");
  const chosen = opponents.find((o) => o.playerId === opponentId) ?? null;

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="leagueSlug" value={leagueSlug} />
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      <input type="hidden" name="opponentId" value={chosen ? chosen.playerId : ""} />
      <BonusOpponentPicker
        opponents={opponents}
        idPrefix={idPrefix}
        value={chosen ? chosen.playerId : ""}
        onChange={setOpponentId}
      />
      <div className="flex items-center gap-2">
        <label htmlFor={`${idPrefix}-life`} className="sr-only">
          Starting life
        </label>
        <select
          id={`${idPrefix}-life`}
          name="startingLife"
          defaultValue="20"
          className="min-h-11 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-base"
        >
          <option value="20">20 life</option>
          <option value="40">40 life</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 min-w-0 flex-1 truncate rounded-md btn-gold px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed"
        >
          {pending
            ? "Starting…"
            : chosen
              ? `Challenge ${chosen.displayName}`
              : "Start a Bonus Game"}
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
