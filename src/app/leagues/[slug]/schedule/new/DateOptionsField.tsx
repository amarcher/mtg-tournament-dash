"use client";

import { useState } from "react";
import {
  RECURRENCE_INTERVALS,
  addDaysToDateTimeLocal,
  generateDateSeries,
  isDateTimeLocal,
} from "@/lib/recurrence";

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-base [color-scheme:dark] focus:border-amber-500 focus:outline-none";

/**
 * Smart default for the next candidate: one week after the last filled row,
 * at the same time. Game nights recur weekly at the same hour far more often
 * than not, and editing a prefilled date beats re-picking a full datetime.
 */
function suggestNext(values: string[]): string {
  const last = [...values].reverse().find((v) => v);
  return last ? addDaysToDateTimeLocal(last, 7) : "";
}

export function DateOptionsField() {
  const [values, setValues] = useState<string[]>(["", "", ""]);
  const [intervalWeeks, setIntervalWeeks] = useState(2);

  const setValue = (i: number, v: string) =>
    setValues((vs) => vs.map((old, j) => (j === i ? v : old)));

  // Fill the remaining rows from the first date at the chosen cadence — the
  // same recurrence the calendar uses, offered here as a way to *find* the
  // candidates instead of typing each one.
  const fillFromFirst = () => {
    const start = values.find((v) => isDateTimeLocal(v));
    if (!start) return;
    const series = generateDateSeries({
      start,
      intervalWeeks,
      count: Math.max(values.length, 3),
    });
    if (series.length) setValues(series);
  };

  const canFill = values.some((v) => isDateTimeLocal(v));

  return (
    <div className="space-y-2">
      {values.map((value, i) => (
        <input
          key={i}
          type="datetime-local"
          name="optionDate"
          required={i < 2}
          aria-label={`Candidate date ${i + 1}`}
          className={inputClass}
          value={value}
          step={900}
          onChange={(e) => setValue(i, e.target.value)}
          onFocus={() => {
            if (!value) setValue(i, suggestNext(values));
          }}
        />
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => setValues((vs) => [...vs, suggestNext(vs)])}
          className="min-h-11 rounded-md bg-zinc-800 px-3 text-sm font-medium hover:bg-zinc-700 active:bg-zinc-700"
        >
          + Add date
        </button>
        {values.length > 2 && (
          <button
            type="button"
            onClick={() => setValues((vs) => vs.slice(0, -1))}
            className="min-h-11 rounded-md border border-zinc-700 px-3 text-sm text-zinc-400 hover:bg-zinc-800 active:bg-zinc-800"
          >
            Remove last
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
        <label htmlFor="poll-cadence" className="text-xs text-zinc-400">
          Fill from the first date:
        </label>
        <select
          id="poll-cadence"
          value={intervalWeeks}
          onChange={(e) => setIntervalWeeks(Number(e.target.value))}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-base"
        >
          {RECURRENCE_INTERVALS.map((o) => (
            <option key={o.weeks} value={o.weeks}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={fillFromFirst}
          disabled={!canFill}
          className="min-h-11 rounded-md bg-zinc-800 px-3 text-sm font-medium transition hover:bg-zinc-700 active:bg-zinc-700 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
