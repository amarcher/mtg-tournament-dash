"use client";

import { useState } from "react";

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 [color-scheme:dark] focus:border-amber-500 focus:outline-none";

export function DateOptionsField() {
  const [count, setCount] = useState(3);

  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <input
          key={i}
          type="datetime-local"
          name="optionDate"
          required={i < 2}
          aria-label={`Candidate date ${i + 1}`}
          className={inputClass}
        />
      ))}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-700"
        >
          + Add date
        </button>
        {count > 2 && (
          <button
            type="button"
            onClick={() => setCount((c) => c - 1)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            Remove last
          </button>
        )}
      </div>
    </div>
  );
}
