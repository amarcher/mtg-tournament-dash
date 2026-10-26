import type { TeamSide } from "@/lib/team-draft";

/**
 * One palette per side, used everywhere a seat shows its team: seating
 * rings, broadcast cards, standings rows. Deliberately not amber — gold
 * already means "winner" across the app.
 */
export const TEAM_STYLES: Record<
  TeamSide,
  { dot: string; ring: string; chip: string; text: string; badge: string }
> = {
  a: {
    dot: "bg-sky-400",
    ring: "ring-sky-400/80",
    chip: "border-sky-400/40 bg-sky-400/15 text-sky-200",
    text: "text-sky-300",
    badge: "bg-sky-400 text-zinc-950",
  },
  b: {
    dot: "bg-fuchsia-400",
    ring: "ring-fuchsia-400/80",
    chip: "border-fuchsia-400/40 bg-fuchsia-400/15 text-fuchsia-200",
    text: "text-fuchsia-300",
    badge: "bg-fuchsia-400 text-zinc-950",
  },
};

export function TeamChip({
  side,
  label,
  className = "",
}: {
  side: TeamSide;
  label: string;
  className?: string;
}) {
  const s = TEAM_STYLES[side];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${s.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}
