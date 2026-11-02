"use client";

import { useState } from "react";
import { pickAvatarUrl } from "@/lib/avatar-tier";
import {
  filterBonusOpponents,
  groupBonusOpponents,
  type BonusOpponent,
  isTiedUp,
  tiedUpLabel,
} from "@/lib/bonus-opponents";

/** Below this many wizards the grid fits on one screen and needs no search. */
const FILTER_MIN_OPPONENTS = 8;

/**
 * Portrait grid for choosing a bonus-game opponent. Each tile wraps a real
 * radio input, so arrow keys, Tab and screen readers behave like any radio
 * group with no custom key handling; the inputs carry a throwaway `name` and
 * the form posts the selection through its own hidden `opponentId` field, so
 * a selection survives being filtered out of the grid.
 */
export function BonusOpponentPicker({
  opponents,
  idPrefix,
  value,
  onChange,
}: {
  opponents: BonusOpponent[];
  idPrefix: string;
  value: string;
  onChange: (playerId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = filterBonusOpponents(opponents, query);
  const groups = groupBonusOpponents(visible);
  const radioName = `${idPrefix}-pick`;
  const showFilter = opponents.length >= FILTER_MIN_OPPONENTS;
  const showHeadings = groupBonusOpponents(opponents).length > 1;

  function onFilterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setQuery("");
      return;
    }
    if (e.key !== "Enter") return;
    // Enter in a search box must never submit the challenge; with a single
    // match left it picks that wizard instead.
    e.preventDefault();
    const free = visible.filter((o) => !isTiedUp(o));
    if (free.length === 1) onChange(free[0].playerId);
  }

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Opponent</legend>
      {showFilter && (
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Find a wizard…"
          aria-label="Find a wizard"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onFilterKeyDown}
          className="mb-3 w-full rounded-[10px] border border-line bg-zinc-950 px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        />
      )}

      <label className="flex min-h-14 cursor-pointer touch-manipulation select-none items-center gap-3 rounded-[10px] border border-line bg-white/[0.03] px-3 py-2 transition has-[:checked]:border-gold/60 has-[:checked]:bg-gold/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber-400/70 active:bg-white/[0.06]">
        <input
          type="radio"
          name={radioName}
          value=""
          className="sr-only"
          checked={value === ""}
          onChange={() => onChange("")}
        />
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-dashed border-gold/60 text-gold"
        >
          <QrGlyph />
        </span>
        <span className="min-w-0 flex-1 text-sm leading-snug">
          <strong className="block font-semibold text-ink">Anyone</strong>
          <span className="text-ink-dim">Open a seat and show a QR code</span>
        </span>
        <SelectedMark selected={value === ""} />
      </label>

      {opponents.length === 0 && (
        <p className="mt-3 text-sm text-ink-dim">
          Nobody else has claimed a wizard in this league yet.
        </p>
      )}
      {opponents.length > 0 && visible.length === 0 && (
        <p className="mt-3 text-sm text-ink-dim">
          No wizard named “{query.trim()}”.
        </p>
      )}

      {groups.map(({ group, members }) => (
        <div key={group} className="mt-3">
          {showHeadings && (
            <p className="label-caps mb-2 text-ink-faint">{group}</p>
          )}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {members.map((o) => (
              <OpponentTile
                key={o.playerId}
                opponent={o}
                radioName={radioName}
                selected={value === o.playerId}
                onSelect={() => onChange(o.playerId)}
              />
            ))}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}

function OpponentTile({
  opponent: o,
  radioName,
  selected,
  onSelect,
}: {
  opponent: BonusOpponent;
  radioName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const url = pickAvatarUrl(20, 20, o.avatars);
  const busy = isTiedUp(o);
  const reason = tiedUpLabel(o);
  return (
    <li className="min-w-0">
      <label
        className={`group flex cursor-pointer touch-manipulation select-none flex-col items-center gap-1.5 rounded-[10px] p-1.5 transition has-[:checked]:bg-gold/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber-400/70 ${
          busy ? "cursor-not-allowed" : "active:bg-white/[0.06]"
        }`}
      >
        <input
          type="radio"
          name={radioName}
          value={o.playerId}
          className="sr-only"
          checked={selected}
          disabled={busy}
          onChange={onSelect}
          aria-label={reason ? `${o.displayName}, in a ${reason}` : o.displayName}
        />
        <span
          aria-hidden
          className={`relative aspect-square w-full overflow-hidden rounded-[10px] bg-surface-2 ring-1 ring-line-strong ${
            selected ? "ring-2 ring-gold" : ""
          }`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              loading="lazy"
              className={`h-full w-full object-cover ${
                busy ? "opacity-50 grayscale" : ""
              }`}
            />
          ) : (
            <span
              className={`grid h-full w-full place-items-center font-display text-2xl text-gold ${
                busy ? "opacity-50" : ""
              }`}
            >
              {o.displayName.charAt(0).toUpperCase()}
            </span>
          )}
          {reason && (
            <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-200">
              {reason}
            </span>
          )}
          {selected && (
            <span className="absolute right-1 top-1">
              <SelectedMark selected />
            </span>
          )}
        </span>
        <span
          className={`w-full truncate text-center text-xs leading-tight ${
            busy ? "text-ink-faint" : selected ? "font-semibold text-gold" : "text-ink"
          }`}
        >
          {o.displayName}
        </span>
      </label>
    </li>
  );
}

function SelectedMark({ selected }: { selected: boolean }) {
  if (!selected) return null;
  return (
    <span
      aria-hidden
      className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-gold-ink shadow-e1"
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
        <path
          d="M5 10.5l3 3 7-7"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function QrGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h3v3h-3v-3zm5 0h3v3h-3v-3zm-5 5h3v3h-3v-3zm5 0h3v3h-3v-3zm-2.5-2.5h3v3h-3v-3z" />
    </svg>
  );
}
