"use client";

import { useEffect } from "react";
import type { EventMessage } from "@/lib/pubsub";

/**
 * Subscribes to the event SSE stream and reloads the page when the organizer
 * starts a new round or finishes one. Drops onto the play page's "no active
 * match" branch so phones auto-advance into their new pairing without anyone
 * having to pull-to-refresh.
 */
export function WaitForRound({ eventId }: { eventId: string }) {
  useEffect(() => {
    const es = new EventSource(`/api/events/${eventId}/stream`);
    es.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(e.data) as EventMessage;
        if (
          msg.type === "round_started" ||
          msg.type === "round_completed" ||
          msg.type === "event_state_changed" ||
          msg.type === "match_complete" ||
          // An undone result puts a "waiting" phone back into its match.
          msg.type === "match_reopened" ||
          // Keep the "looking for a bonus game" list current while waiting.
          msg.type === "bonus_game_opened" ||
          msg.type === "bonus_game_started" ||
          msg.type === "bonus_game_ended"
        ) {
          window.location.reload();
        }
      } catch {
        /* ignore non-JSON heartbeats */
      }
    });
    return () => es.close();
  }, [eventId]);
  return null;
}
