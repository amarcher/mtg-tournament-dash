"use client";

import { useState, useTransition } from "react";
import { setPendingPairingsAction } from "@/app/events/actions";

type Player = { playerId: string; displayName: string };
type Table = { a: string; b: string };

const BYE = "__bye__";

/**
 * Seat every table by hand. Starts from the current pending pairings so it
 * doubles as a bulk editor; a player picked at one table is disabled
 * everywhere else, and rematches are flagged rather than blocked — the
 * organizer is deliberately overriding the Swiss logic here.
 */
export function PairingBuilder({
  eventId,
  players,
  initialTables,
  pastOpponents,
}: {
  eventId: string;
  players: Player[];
  initialTables: { a: string; b: string | null }[];
  pastOpponents: Record<string, string[]>;
}) {
  const tableCount = Math.ceil(players.length / 2);
  const [tables, setTables] = useState<Table[]>(() =>
    Array.from({ length: tableCount }, (_, i) => {
      const t = initialTables[i];
      return t ? { a: t.a, b: t.b ?? BYE } : { a: "", b: "" };
    })
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const used = new Set(
    tables.flatMap((t) => [t.a, t.b]).filter((id) => id && id !== BYE)
  );
  const unseated = players.filter((p) => !used.has(p.playerId));
  const complete = tables.filter((t) => t.a && t.b);
  const halfFilled = tables.some((t) => !t.a !== !t.b);
  const byeCount = tables.filter((t) => t.b === BYE).length;

  const set = (i: number, side: keyof Table, value: string) =>
    setTables((prev) =>
      prev.map((t, j) => (j === i ? { ...t, [side]: value } : t))
    );

  const clearAll = () =>
    setTables(Array.from({ length: tableCount }, () => ({ a: "", b: "" })));

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        await setPendingPairingsAction({
          eventId,
          pairings: complete.map((t) => ({
            playerAId: t.a,
            playerBId: t.b === BYE ? null : t.b,
          })),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save pairings");
      }
    });
  };

  const selectClass =
    "min-w-[7rem] flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-base md:text-sm";

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {tables.map((t, i) => {
          const rematch =
            t.a && t.b && t.b !== BYE && pastOpponents[t.a]?.includes(t.b);
          return (
            <li
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-2"
            >
              <span className="w-8 shrink-0 font-mono text-xs text-zinc-500">
                T{i + 1}
              </span>
              <select
                aria-label={`Table ${i + 1} player A`}
                value={t.a}
                onChange={(e) => set(i, "a", e.target.value)}
                className={selectClass}
              >
                <option value="">—</option>
                {players.map((p) => (
                  <option
                    key={p.playerId}
                    value={p.playerId}
                    disabled={used.has(p.playerId) && p.playerId !== t.a}
                  >
                    {p.displayName}
                  </option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">vs</span>
              <select
                aria-label={`Table ${i + 1} player B`}
                value={t.b}
                onChange={(e) => set(i, "b", e.target.value)}
                className={selectClass}
              >
                <option value="">—</option>
                <option value={BYE} disabled={byeCount > 0 && t.b !== BYE}>
                  (bye)
                </option>
                {players.map((p) => (
                  <option
                    key={p.playerId}
                    value={p.playerId}
                    disabled={used.has(p.playerId) && p.playerId !== t.b}
                  >
                    {p.displayName}
                  </option>
                ))}
              </select>
              {rematch && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-amber-300">
                  Rematch
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {unseated.length > 0 && (
        <p className="text-xs text-zinc-400">
          Not seated ({unseated.length}):{" "}
          {unseated.map((p) => p.displayName).join(", ")}{" "}
          — they&apos;ll sit
          this round out.
        </p>
      )}
      {halfFilled && (
        <p className="text-xs text-amber-300">
          Finish or clear the half-filled table before saving.
        </p>
      )}
      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || complete.length === 0 || halfFilled}
          className="min-h-11 rounded-md btn-gold px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Saving…"
            : `Use these ${complete.length} table${complete.length === 1 ? "" : "s"}`}
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={pending}
          className="min-h-11 rounded-md border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800"
        >
          Clear all
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Nothing changes until you save. Players still won&apos;t see the round
        until you confirm.
      </p>
    </div>
  );
}
