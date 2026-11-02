"use client";

import { useActionState, useState } from "react";
import {
  sendLeagueMessageAction,
  type LeagueMessageFormState,
} from "@/app/events/actions";
import {
  MESSAGE_BODY_MAX,
  MESSAGE_PRESETS,
  MESSAGE_TITLE_MAX,
  type MessagePreset,
} from "@/lib/league-message";

export type DestinationOption = { key: string; label: string; group: string };

const initialState: LeagueMessageFormState = { status: "idle", error: null };

export function MessageComposer({
  leagueId,
  options,
  presetTargets,
  reach,
}: {
  leagueId: string;
  options: DestinationOption[];
  presetTargets: Record<MessagePreset["destination"], string>;
  reach: { phones: number; players: number; roster: number };
}) {
  const [state, formAction, pending] = useActionState(
    sendLeagueMessageAction,
    initialState
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [destination, setDestination] = useState(options[0]?.key ?? "home");

  const applyPreset = (p: MessagePreset) => {
    setTitle(p.title);
    setBody(p.body);
    setDestination(presetTargets[p.destination]);
  };

  const groups = options.reduce<Map<string, DestinationOption[]>>((acc, o) => {
    acc.set(o.group, [...(acc.get(o.group) ?? []), o]);
    return acc;
  }, new Map());

  const justSent = state.status === "sent" && state.title === title.trim();
  const nobody = reach.phones === 0;
  const field =
    "mt-1 w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-amber-400/70";

  return (
    <form action={formAction} className="surface-card flex flex-col gap-4 p-4">
      <input type="hidden" name="leagueId" value={leagueId} />

      <p className="text-sm text-ink-dim">
        {nobody
          ? `Nobody in the league has the app with notes switched on yet, so there is no one to send to.`
          : `Reaches ${reach.phones} ${reach.phones === 1 ? "phone" : "phones"} across ${reach.players} of ${reach.roster} players.`}
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Start from">
        {MESSAGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p)}
            className="min-h-11 rounded-full border border-line px-4 text-sm btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="flex items-baseline justify-between text-sm font-semibold">
          Title
          <span className="text-xs font-normal text-ink-faint">
            {title.length}/{MESSAGE_TITLE_MAX}
          </span>
        </span>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MESSAGE_TITLE_MAX}
          required
          autoComplete="off"
          placeholder="Results are in"
          className={field}
        />
      </label>

      <label className="block">
        <span className="flex items-baseline justify-between text-sm font-semibold">
          Note
          <span className="text-xs font-normal text-ink-faint">
            {body.length}/{MESSAGE_BODY_MAX}
          </span>
        </span>
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MESSAGE_BODY_MAX}
          required
          rows={3}
          placeholder="Final standings are posted. See how you finished."
          className={`${field} resize-y`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold">A tap opens</span>
        <select
          name="destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className={`${field} min-h-11`}
        >
          {[...groups.entries()].map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-rose-300">
          {state.error}
        </p>
      )}
      {state.status === "sent" && (
        <p role="status" className="rounded-[8px] bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Sent “{state.title}” to {state.sent} {state.sent === 1 ? "phone" : "phones"}.
          {state.optedOut > 0 &&
            ` ${state.optedOut} ${state.optedOut === 1 ? "phone has" : "phones have"} notes switched off.`}
          {state.failed > 0 && ` ${state.failed} could not be delivered.`}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || nobody || justSent}
        className="min-h-12 rounded-[8px] px-4 text-base btn-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-50"
      >
        {pending ? "Sending…" : justSent ? "Sent" : "Send to the league"}
      </button>
    </form>
  );
}
