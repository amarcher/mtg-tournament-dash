"use client";

import { Fragment, useActionState } from "react";
import {
  createBonusGameAction,
  type BonusGameFormState,
} from "@/app/events/actions";
import type { BonusOpponent } from "@/lib/bonus-opponents";

const initialState: BonusGameFormState = { error: null };

function renderOption(o: BonusOpponent) {
  return (
    <option key={o.playerId} value={o.playerId} disabled={o.busy}>
      {o.busy ? `${o.displayName} — mid-game` : o.displayName}
    </option>
  );
}

function groupOpponents(opponents: BonusOpponent[]) {
  const groups: { group: string | undefined; members: BonusOpponent[] }[] = [];
  for (const o of opponents) {
    const last = groups[groups.length - 1];
    if (last && last.group === o.group) last.members.push(o);
    else groups.push({ group: o.group, members: [o] });
  }
  return groups;
}

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
        {groupOpponents(opponents).map(({ group, members }) =>
          group ? (
            <optgroup key={group} label={group}>
              {members.map(renderOption)}
            </optgroup>
          ) : (
            <Fragment key="ungrouped">{members.map(renderOption)}</Fragment>
          )
        )}
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
          className="flex-1 rounded-md btn-gold px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed"
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
