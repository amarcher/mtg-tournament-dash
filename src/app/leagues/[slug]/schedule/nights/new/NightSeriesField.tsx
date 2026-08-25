"use client";

import { useState } from "react";
import {
  MAX_SERIES_COUNT,
  RECURRENCE_INTERVALS,
  generateDateSeries,
  isDateTimeLocal,
} from "@/lib/recurrence";
import { formatPollDate, parseDateTimeLocal } from "@/lib/schedule-types";

const controlClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-base [color-scheme:dark] focus:border-amber-500 focus:outline-none";

function preview(value: string) {
  const parsed = isDateTimeLocal(value) ? parseDateTimeLocal(value) : null;
  return parsed ? formatPollDate(parsed) : "—";
}

/**
 * Builds the list of dates the organizer is about to open. The recurrence
 * controls only *fill* the list — every generated date stays individually
 * editable and removable, so "every other Monday, except we skip Labor Day"
 * needs no special support.
 */
export function NightSeriesField() {
  const [start, setStart] = useState("");
  const [intervalWeeks, setIntervalWeeks] = useState(2);
  const [count, setCount] = useState(6);
  const [dates, setDates] = useState<string[]>([]);

  const fill = (mode: "replace" | "append") => {
    const series = generateDateSeries({ start, intervalWeeks, count });
    if (series.length === 0) return;
    setDates((prev) => {
      const next = mode === "replace" ? series : [...prev, ...series];
      return [...new Set(next)].sort();
    });
  };

  const setDate = (i: number, value: string) =>
    setDates((prev) => prev.map((d, j) => (j === i ? value : d)));

  return (
    <div className="space-y-6">
      <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <legend className="px-1 text-sm font-medium text-zinc-300">
          Generate a run
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              First night
            </span>
            <input
              type="datetime-local"
              value={start}
              step={900}
              onChange={(e) => setStart(e.target.value)}
              className={controlClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Cadence
            </span>
            <select
              value={intervalWeeks}
              onChange={(e) => setIntervalWeeks(Number(e.target.value))}
              className={controlClass}
            >
              {RECURRENCE_INTERVALS.map((o) => (
                <option key={o.weeks} value={o.weeks}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              How many
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SERIES_COUNT}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className={controlClass}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fill("replace")}
            disabled={!isDateTimeLocal(start)}
            className="min-h-11 rounded-md bg-zinc-800 px-4 text-sm font-medium transition hover:bg-zinc-700 active:bg-zinc-700 disabled:opacity-40"
          >
            Generate dates
          </button>
          <button
            type="button"
            onClick={() => fill("append")}
            disabled={!isDateTimeLocal(start) || dates.length === 0}
            className="min-h-11 rounded-md border border-zinc-700 px-4 text-sm text-zinc-300 transition hover:bg-zinc-800 active:bg-zinc-800 disabled:opacity-40"
          >
            Add to the list
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Same weekday and time as the first night — e.g. every other Monday
          starting Aug 31, 7:00 PM.
        </p>
      </fieldset>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-zinc-300">
            Dates to open{dates.length > 0 ? ` (${dates.length})` : ""}
          </span>
          <button
            type="button"
            onClick={() => setDates((prev) => [...prev, start || ""])}
            className="min-h-11 rounded-md border border-zinc-700 px-3 text-sm text-zinc-300 transition hover:bg-zinc-800 active:bg-zinc-800"
          >
            + One-off date
          </button>
        </div>

        {dates.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            Generate a run above, or add a single date — an arbitrary night
            works exactly the same, it just isn&apos;t part of a cadence.
          </p>
        ) : (
          <ul className="space-y-2">
            {dates.map((value, i) => (
              <li key={i} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <input
                    type="datetime-local"
                    name="nightDate"
                    required
                    aria-label={`Date ${i + 1}`}
                    value={value}
                    step={900}
                    onChange={(e) => setDate(i, e.target.value)}
                    className={controlClass}
                  />
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {preview(value)}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove date ${i + 1}`}
                  onClick={() =>
                    setDates((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="min-h-11 min-w-11 shrink-0 rounded-md border border-zinc-700 text-zinc-400 transition hover:border-rose-500/60 hover:text-rose-300 active:bg-zinc-800"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={dates.length === 0}
        className="min-h-11 w-full rounded-full bg-amber-500 px-6 font-semibold text-zinc-950 transition hover:bg-amber-400 active:bg-amber-400 disabled:opacity-40 sm:w-auto"
      >
        Open {dates.length || ""} date{dates.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}
