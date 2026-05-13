"use client";

import {
  pickMatchOutcomeAvatar,
  type AvatarTiers,
} from "@/lib/avatar-tier";
import type { MatchHistoryRow } from "@/db/queries";

export type FinalRankingPlayer = {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
  startingElo: number;
  endingElo: number;
  eventEloDelta: number;
  avatars: AvatarTiers;
  history: MatchHistoryRow[];
};

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function fmtDelta(d: number): string {
  if (d === 0) return "±0";
  return d > 0 ? `+${d}` : `${d}`;
}

function deltaColor(d: number | null): string {
  if (d === null) return "text-zinc-500";
  if (d > 0) return "text-emerald-400";
  if (d < 0) return "text-red-400";
  return "text-zinc-400";
}

function avatarForRank(
  rank: number,
  total: number,
  avatars: AvatarTiers
): string | null {
  if (rank === 1) return pickMatchOutcomeAvatar("won", avatars);
  if (rank === total) return pickMatchOutcomeAvatar("lost", avatars);
  return (
    avatars.fresh ?? avatars.wounded ?? avatars.critical ?? avatars.victory ?? null
  );
}

/**
 * Final standings layout — one wizard card per player in finishing order.
 *
 * Layout is driven by the *wrapping container's* width, not the viewport:
 *
 *   container <  36rem  → single column            (phone, /play's max-w-md)
 *   container >= 36rem  → 2 columns                (tablet, mid-width broadcast)
 *   container >= 42rem  → 3 columns                (large tablet)
 *   container >= 48rem  → N columns                (TV broadcast — single horizontal row)
 *
 * Where N is the number of players (capped to keep cards readable when there
 * are many entries). The card itself also uses `container-type: inline-size`
 * so its internal font sizes scale with whatever cell width it ends up in.
 *
 * No `variant` prop is needed — both /broadcast (full-viewport on TV, phone
 * width on a phone) and /play (always inside `max-w-md`) just embed
 * `<FinalRanking …/>` and get the right layout for free.
 */
export function FinalRanking({
  players,
  highlightPlayerId,
}: {
  players: FinalRankingPlayer[];
  highlightPlayerId?: string;
}) {
  const total = players.length;
  // N-col layout for ≤ 6 players keeps one row; beyond that, ceil(N/2) so the
  // cards don't get squished into thin strips. Wrapped in a CSS custom property
  // so the @3xl: rule below can read it without needing dynamically-generated
  // Tailwind class names.
  const wideCols = total <= 6 ? Math.max(total, 1) : Math.ceil(total / 2);

  return (
    // @container so card sizing tracks the FinalRanking's own width, not the
    // viewport — TV broadcast at 1920px and a phone at 390px hit this code
    // with the same component. `flex-1 + min-h-0` is gated to @3xl so on
    // narrow containers the cards keep their natural aspect-[3/4] height
    // instead of getting squashed into N equal rows when stacked.
    <div
      className="@container grid w-full grid-cols-1 gap-3 @xl:grid-cols-2 @2xl:grid-cols-3 @3xl:min-h-0 @3xl:flex-1 @3xl:[grid-template-columns:var(--final-cols)]"
      style={{
        ["--final-cols" as string]: `repeat(${wideCols}, minmax(0, 1fr))`,
      }}
    >
      {players.map((p, i) => (
        <RankedCard
          key={p.playerId}
          player={p}
          rank={i + 1}
          total={total}
          highlight={p.playerId === highlightPlayerId}
        />
      ))}
    </div>
  );
}

function RankedCard({
  player,
  rank,
  total,
  highlight,
}: {
  player: FinalRankingPlayer;
  rank: number;
  total: number;
  highlight: boolean;
}) {
  const avatarUrl = avatarForRank(rank, total, player.avatars);
  const isWinner = rank === 1;
  const rankColor =
    rank === 1
      ? "text-amber-300"
      : rank === 2
        ? "text-zinc-200"
        : rank === 3
          ? "text-amber-700"
          : "text-zinc-500";

  return (
    <div
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-zinc-900 ${
        highlight
          ? "border-emerald-500/70 ring-2 ring-emerald-500/60"
          : isWinner
            ? "border-amber-500/70"
            : "border-zinc-800"
      }`}
      style={{ containerType: "inline-size" }}
    >
      {/* Portrait fills the top of the card. Aspect 3/4 — slightly taller than
          square, gives faces real estate without the card becoming awkwardly
          tall when stacked on a phone. */}
      <div className="relative w-full aspect-[3/4]">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-zinc-950">
            <span className="grid h-20 w-20 place-items-center rounded-full border border-dashed border-amber-500/40 font-mono text-3xl text-amber-400/60">
              {player.displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {/* Rank badge — clamped to the card's own width via cqi, so it stays
            legible whether the card is 80 px wide or 320 px. */}
        <div
          className={`absolute left-2 top-2 z-10 rounded-lg bg-zinc-950/85 px-2.5 py-1 font-bold tabular-nums backdrop-blur ${rankColor}`}
          style={{
            fontSize: "clamp(1rem, 8cqi, 2.4rem)",
            textShadow: "0 2px 8px rgba(0,0,0,0.9)",
          }}
        >
          {ordinal(rank)}
        </div>
        {isWinner && (
          <div
            className="absolute right-2 top-2 z-10 rounded-full bg-amber-500 px-2 py-0.5 font-bold uppercase tracking-[0.2em] text-zinc-950"
            style={{
              fontSize: "clamp(0.5rem, 2.4cqi, 0.7rem)",
            }}
          >
            Champion
          </div>
        )}
        {/* Bottom scrim + name + stats — all scaled with cqi so the card holds
            up at any width from a phone column to a TV cell. */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-0.5 px-2 pb-2">
          <div
            className="max-w-full truncate text-center font-semibold tracking-tight text-white"
            style={{
              fontSize: "clamp(0.9rem, 6cqi, 1.5rem)",
              textShadow: "0 2px 8px rgba(0,0,0,0.9)",
            }}
          >
            {player.displayName}
          </div>
          <div
            className="font-mono tabular-nums text-zinc-200"
            style={{
              fontSize: "clamp(0.7rem, 3.4cqi, 1rem)",
              textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            }}
          >
            {player.wins}-{player.losses}-{player.draws}
            <span className="ml-1.5 text-zinc-400">
              · {player.matchPoints} pts
            </span>
          </div>
          <div
            className="font-mono tabular-nums"
            style={{
              fontSize: "clamp(0.65rem, 3cqi, 0.9rem)",
              textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            }}
          >
            <span className="text-zinc-300">{player.endingElo}</span>
            <span className={`ml-1.5 ${deltaColor(player.eventEloDelta)}`}>
              {fmtDelta(player.eventEloDelta)}
            </span>
            <span className="ml-1.5 text-zinc-500">
              from {player.startingElo}
            </span>
          </div>
        </div>
      </div>

      {/* Per-round history list — sits below the portrait. Hidden on the
          smallest container widths (< 12rem cell) where it'd be unreadable
          anyway; reappears as soon as the card has room. */}
      <ul className="flex shrink-0 flex-col gap-0.5 px-3 py-2 text-xs">
        {player.history.length === 0 ? (
          <li className="text-zinc-500">No completed rounds</li>
        ) : (
          player.history.map((h) => (
            <li
              key={h.roundNumber}
              className="flex items-baseline gap-2 truncate font-mono"
            >
              <span className="shrink-0 text-zinc-500">R{h.roundNumber}</span>
              <OutcomeBadge outcome={h.outcome} />
              <span className="min-w-0 flex-1 truncate text-zinc-300">
                {h.outcome === "BYE" ? "bye" : `vs ${h.opponentName ?? "?"}`}
              </span>
              {h.eloDelta !== null && (
                <span className={`shrink-0 ${deltaColor(h.eloDelta)}`}>
                  {fmtDelta(h.eloDelta)}
                </span>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: "W" | "L" | "D" | "BYE" }) {
  const cls =
    outcome === "W"
      ? "text-emerald-400"
      : outcome === "L"
        ? "text-red-400"
        : outcome === "D"
          ? "text-zinc-300"
          : "text-amber-300";
  return <span className={`w-4 shrink-0 text-center font-bold ${cls}`}>{outcome}</span>;
}
