"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { sharePathFor, shareLink } from "@/lib/share-link";

/**
 * Shares the player-facing link for the page being looked at. The installed
 * app has no address bar, so this is the only way to get a link out of it.
 * `label` switches from the top bar's icon to a worded button.
 */
export function ShareButton({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const [note, setNote] = useState<string | null>(null);
  const path = sharePathFor(pathname);
  if (!path) return null;

  const share = async () => {
    const outcome = await shareLink({
      title: document.title,
      url: window.location.origin + path,
    });
    if (outcome === "copied" || outcome === "failed") {
      setNote(outcome === "copied" ? "Link copied" : "Couldn't copy the link");
      window.setTimeout(() => setNote(null), 1800);
    }
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={share}
        aria-label={label ? undefined : "Share this page"}
        className={
          className ??
          "grid h-11 w-11 place-items-center rounded-full btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        }
      >
        {label ?? (
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 15V3M8 7l4-4 4 4M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
          </svg>
        )}
      </button>
      <span
        role="status"
        className={`pointer-events-none absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-100 shadow-lg ${
          note ? "" : "hidden"
        }`}
      >
        {note}
      </span>
    </span>
  );
}
