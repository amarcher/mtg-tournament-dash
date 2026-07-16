"use client";

import { useState } from "react";

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 [color-scheme:dark] focus:border-amber-500 focus:outline-none";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Smart default for the next candidate: one week after the last filled row,
 * at the same time. Game nights recur weekly at the same hour far more often
 * than not, and editing a prefilled date beats re-picking a full datetime.
 */
function suggestNext(values: string[]): string {
  const last = [...values].reverse().find((v) => v);
  if (!last) return "";
  const [datePart, timePart] = last.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const next = new Date(y, m - 1, d + 7);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(
    next.getDate()
  )}T${timePart}`;
}

export function DateOptionsField() {
  const [values, setValues] = useState<string[]>(["", "", ""]);

  const setValue = (i: number, v: string) =>
    setValues((vs) => vs.map((old, j) => (j === i ? v : old)));

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
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setValues((vs) => [...vs, suggestNext(vs)])}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-700"
        >
          + Add date
        </button>
        {values.length > 2 && (
          <button
            type="button"
            onClick={() => setValues((vs) => vs.slice(0, -1))}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            Remove last
          </button>
        )}
      </div>
    </div>
  );
}
