"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
