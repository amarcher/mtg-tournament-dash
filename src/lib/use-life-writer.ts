"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adjustLifeAction } from "@/app/events/actions";
import { REMOTE_EDIT_LOCK_MS } from "@/lib/life-events";
import type { LifeSide } from "@/lib/life-history";

type Sides<T> = Record<LifeSide, T>;

type Run = {
  /** A request loop is draining this side. */
  running: boolean;
  /** Taps made since the last request was sent, summed. */
  pending: number;
  /** Life the server last confirmed for this run — the next CAS token. */
  base: number;
  /** Game the run started in; a run never follows a game flip. */
  gameId: string;
};

/**
 * Sends life taps to the server and holds the other player's edits apart.
 *
 * Taps are optimistic and coalesced: one request per side is in flight at a
 * time, and everything tapped while it was out goes in the next one as a
 * single delta. Sending a request per tap queued them — Next runs server
 * actions strictly one after another — so ten quick taps put ten round-trips
 * ahead of "I won" and left the other phone and the TV seconds behind.
 *
 * Each request is still a compare-and-set against the last confirmed total,
 * so two phones can't both apply a change to the same number. Rather than let
 * the loser's taps vanish after the fact, a side being edited by the other
 * player is locked here until their change settles (`locked`).
 */
export function useLifeWriter({
  matchId,
  currentGameId,
  lives,
  setLife,
}: {
  matchId: string;
  currentGameId: { readonly current: string };
  lives: Sides<number>;
  setLife: (side: LifeSide, next: number | ((v: number) => number)) => void;
}) {
  const runs = useRef<Sides<Run>>({
    a: { running: false, pending: 0, base: 0, gameId: "" },
    b: { running: false, pending: 0, base: 0, gameId: "" },
  });
  // True while a run owns that side's displayed total. The SSE and poll
  // reconcilers read it and stand down: what they carry is a server snapshot
  // from before taps still on their way, and applying it rewinds the counter.
  const inFlight = useRef<Sides<boolean>>({ a: false, b: false });
  const [locked, setLocked] = useState<Sides<boolean>>({ a: false, b: false });
  const lockedRef = useRef<Sides<boolean>>({ a: false, b: false });
  const lockTimers = useRef<Sides<ReturnType<typeof setTimeout> | null>>({
    a: null,
    b: null,
  });

  const lockSide = useCallback((side: LifeSide, ms: number) => {
    if (ms <= 0) return;
    const timers = lockTimers.current;
    if (timers[side]) clearTimeout(timers[side]);
    lockedRef.current[side] = true;
    setLocked((l) => (l[side] ? l : { ...l, [side]: true }));
    timers[side] = setTimeout(() => {
      timers[side] = null;
      lockedRef.current[side] = false;
      setLocked((l) => ({ ...l, [side]: false }));
    }, ms);
  }, []);

  useEffect(() => {
    const timers = lockTimers.current;
    return () => {
      if (timers.a) clearTimeout(timers.a);
      if (timers.b) clearTimeout(timers.b);
    };
  }, []);

  const drain = async (side: LifeSide) => {
    const run = runs.current[side];
    run.running = true;
    inFlight.current[side] = true;
    try {
      while (run.pending !== 0) {
        const delta = run.pending;
        run.pending = 0;
        const res = await adjustLifeAction({
          matchId,
          side,
          delta,
          gameId: run.gameId,
          expectedLife: run.base,
        });
        if (res.ok) {
          run.base = res.life;
          continue;
        }
        // Someone else's write landed first. Whatever was tapped on top of
        // the stale total goes with it; show the real number and hold this
        // side until their change settles.
        run.pending = 0;
        if (res.life !== null) setLife(side, res.life);
        if (res.reason === "stale_life") lockSide(side, REMOTE_EDIT_LOCK_MS);
        return;
      }
      setLife(side, run.base);
    } catch {
      // Request never completed, so we can't know if it applied. Hand the
      // total back to the poll, which redraws it from the server.
      run.pending = 0;
    } finally {
      run.running = false;
      inFlight.current[side] = false;
    }
  };

  const adjust = (side: LifeSide, delta: number) => {
    if (lockedRef.current[side]) return;
    const run = runs.current[side];
    if (!run.running) {
      run.base = lives[side];
      run.gameId = currentGameId.current;
    }
    run.pending += delta;
    setLife(side, (v) => v + delta);
    if (!run.running) void drain(side);
  };

  return { adjust, inFlight, locked, lockSide };
}
