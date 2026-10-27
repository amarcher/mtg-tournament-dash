"use client";

import { formatClock } from "@/lib/round-clock";
import { useRoundClock } from "@/lib/use-round-clock";

/** The small time-left readout in the scorekeeper's header. */
export function RoundClockChip({
  startedAtIso,
  durationSec,
}: {
  startedAtIso: string | null;
  durationSec: number;
}) {
  const clock = useRoundClock(startedAtIso, durationSec);
  if (!clock) return null;
  const tone = clock.overtime
    ? "text-rose-300"
    : clock.lowTime
      ? "text-gold"
      : "text-ink-dim";
  return (
    <span
      className={`font-mono text-xs font-semibold tabular-nums ${tone}`}
      aria-label={
        clock.overtime
          ? `Time called, ${formatClock(-clock.remaining)} over`
          : `${formatClock(clock.remaining)} left in the round`
      }
    >
      {clock.overtime ? `+${formatClock(-clock.remaining)}` : formatClock(clock.remaining)}
    </span>
  );
}
