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
 * The screen the TV (and the player's phone) drops into after the final
 * round of a tournament closes. Renders one wizard card per player,
 * arranged left-to-right in finishing order with each player's per-round
 * history listed underneath their portrait.
 *
 * - `players` must be pre-sorted by tiebreaker order (rank == index + 1).
 * - `highlightPlayerId` rings the matching card; used on the phone view so
 *   each player can find themselves at a glance.
 * - `variant` switches between full-screen TV layout (`tv`, fills the
 *   broadcast cell, large portraits) and a compact phone layout (`compact`,
 *   one column per card scaled by container width).
 */
export function FinalRanking({
  players,
  highlightPlayerId,
  variant = "tv",
}: {
  players: FinalRankingPlayer[];
  highlightPlayerId?: string;
  variant?: "tv" | "compact";
}) {
  const total = players.length;
  const gridStyle: React.CSSProperties =
    variant === "tv"
      ? {
          // For TV: a single horizontal row when ≤6 players; multi-row only
          // when there are too many to fit comfortably.
          gridTemplateColumns:
            total <= 6
              ? `repeat(${Math.max(total, 1)}, minmax(0, 1fr))`
              : `repeat(${Math.ceil(total / 2)}, minmax(0, 1fr))`,
        }
      : { gridTemplateColumns: "1fr" };

  return (
    <div
      className={
        variant === "tv"
          ? "grid min-h-0 flex-1 gap-3"
          : "grid w-full gap-3"
      }
      style={gridStyle}
    >
      {players.map((p, i) => (
        <RankedCard
          key={p.playerId}
          player={p}
          rank={i + 1}
          total={total}
          highlight={p.playerId === highlightPlayerId}
          variant={variant}
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
  variant,
}: {
  player: FinalRankingPlayer;
  rank: number;
  total: number;
  highlight: boolean;
  variant: "tv" | "compact";
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
      {/* Portrait fills the top portion of the card */}
      <div
        className={`relative w-full ${
          variant === "tv" ? "aspect-[3/4]" : "aspect-[4/5]"
        }`}
      >
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
        {/* Rank badge — top-left, large enough to read from across a room */}
        <div
          className={`absolute left-2 top-2 z-10 rounded-lg bg-zinc-950/80 px-3 py-1 font-bold tabular-nums backdrop-blur ${rankColor}`}
          style={{
            fontSize: variant === "tv" ? "clamp(1.2rem, 7cqi, 2.4rem)" : "1.5rem",
            textShadow: "0 2px 8px rgba(0,0,0,0.9)",
          }}
        >
          {ordinal(rank)}
        </div>
        {isWinner && (
          <div className="absolute right-2 top-2 z-10 rounded-full bg-amber-500 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.25em] text-zinc-950">
            Champion
          </div>
        )}
        {/* Readability scrim at the bottom for name + stats */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-0.5 px-3 pb-2">
          <div
            className="max-w-full truncate text-center font-semibold tracking-tight text-white"
            style={{
              fontSize:
                variant === "tv" ? "clamp(0.95rem, 5cqi, 1.6rem)" : "1.1rem",
              textShadow: "0 2px 8px rgba(0,0,0,0.9)",
            }}
          >
            {player.displayName}
          </div>
          <div
            className="font-mono tabular-nums text-zinc-200"
            style={{
              fontSize:
                variant === "tv" ? "clamp(0.7rem, 3cqi, 1rem)" : "0.8rem",
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
              fontSize:
                variant === "tv" ? "clamp(0.65rem, 2.8cqi, 0.95rem)" : "0.75rem",
              textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            }}
          >
            <span className="text-zinc-300">{player.endingElo}</span>
            <span className={`ml-1.5 ${deltaColor(player.eventEloDelta)}`}>
              {fmtDelta(player.eventEloDelta)}
            </span>
            <span className="ml-1.5 text-zinc-500">
              ELO from {player.startingElo}
            </span>
          </div>
        </div>
      </div>

      {/* Per-round history list — sits below the portrait */}
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
