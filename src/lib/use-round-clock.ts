"use client";

import { useEffect, useState } from "react";
import { roundClock, type RoundClock } from "./round-clock";

/** Ticks once a second. Null when the round hasn't started. */
export function useRoundClock(
  startedAtIso: string | null,
  durationSec: number
): RoundClock | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAtIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAtIso]);
  if (!startedAtIso) return null;
  return roundClock(new Date(startedAtIso).getTime(), durationSec, now);
}
