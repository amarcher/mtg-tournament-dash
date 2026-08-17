"use client";

import { useEffect, useTransition } from "react";
import { endBonusGameAction } from "@/app/events/actions";
import type { EventMessage } from "@/lib/pubsub";

/**
 * Invisible listener for the bonus-game waiting and final screens. Reloads
 * when this game starts or ends, and follows the pair into a fresh bonus
 * game when a started event carries a different matchId.
 */
export function BonusGameLive({ matchId }: { matchId: string }) {
  useEffect(() => {
    const es = new EventSource(`/api/matches/${matchId}/stream`);
    es.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(e.data) as EventMessage;
        if (msg.type === "bonus_game_started") {
          if (msg.matchId === matchId) window.location.reload();
          else window.location.href = `/matches/${msg.matchId}`;
        }
        if (msg.type === "bonus_game_ended" && msg.matchId === matchId) {
          window.location.reload();
        }
      } catch {
        /* ignore non-JSON heartbeats */
      }
    });
    return () => es.close();
  }, [matchId]);
  return null;
}

/** "Cancel" on the waiting screen — ends the open game, returns to the league. */
export function CancelBonusGameButton({
  matchId,
  redirectTo,
}: {
  matchId: string;
  redirectTo: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await endBonusGameAction({ matchId });
          window.location.href = redirectTo;
        })
      }
      disabled={pending}
      className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-50"
    >
      Cancel bonus game
    </button>
  );
}
