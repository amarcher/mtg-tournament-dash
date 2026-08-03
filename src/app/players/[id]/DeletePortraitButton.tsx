"use client";

import { useState } from "react";
import { deletePortraitAction } from "@/app/events/actions";

/**
 * Two-step inline confirmation instead of a native confirm() dialog: the
 * first tap arms the button, the second actually deletes. Server-side the
 * action refuses to delete the active set regardless.
 */
export function DeletePortraitButton({
  playerId,
  portraitId,
}: {
  playerId: string;
  portraitId: string;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="w-full rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex gap-1.5">
      <form action={deletePortraitAction} className="flex-1">
        <input type="hidden" name="playerId" value={playerId} />
        <input type="hidden" name="portraitId" value={portraitId} />
        <button
          type="submit"
          className="w-full rounded-md bg-red-500 px-2 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-red-400"
        >
          Really delete
        </button>
      </form>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-zinc-800"
      >
        Cancel
      </button>
    </div>
  );
}
