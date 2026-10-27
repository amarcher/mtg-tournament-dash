"use client";

import {
  pickMatchOutcomeAvatar,
  type AvatarTiers,
} from "@/lib/avatar-tier";
import type { MatchHistoryRow } from "@/db/queries";
import type { TeamNames, TeamSide } from "@/lib/team-draft";
import { TeamChip, TEAM_STYLES } from "./TeamChip";

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
  /** Team-draft side; absent on Swiss events. */
  team?: TeamSide | null;
};

/** Team-draft context for the ranking: which side won, and what to call them. */
export type FinalRankingTeams = {
  names: TeamNames;
  winner: TeamSide | null;
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
  avatars: AvatarTiers,
  teamOutcome: "won" | "lost" | null
): string | null {
  if (teamOutcome) return pickMatchOutcomeAvatar(teamOutcome, avatars);
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
  teams,
}: {
  players: FinalRankingPlayer[];
  highlightPlayerId?: string;
  teams?: FinalRankingTeams | null;
}) {
  if (teams) {
    return (
      <TeamRanking
        players={players}
        highlightPlayerId={highlightPlayerId}
        teams={teams}
      />
    );
  }
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
          teams={null}
        />
      ))}
    </div>
  );
}

/**
 * Team draft: one row per team, winners on top, each row ordered by the
 * player's own record (best on the left). `players` arrives already sorted
 * that way by getEventStandings, so grouping preserves the order.
 *
 * Same container-driven layout as the Swiss grid, but the breakpoints are
 * read off a *named* container (`ranking`) so the cards — themselves
 * inline-size containers for their text — can still respond to the whole
 * ranking's width. On a TV the two rows split the height and the portraits
 * fill their cells; on a phone the rows stack and keep their 3:4 portraits.
 */
function TeamRanking({
  players,
  highlightPlayerId,
  teams,
}: {
  players: FinalRankingPlayer[];
  highlightPlayerId?: string;
  teams: FinalRankingTeams;
}) {
  const order: TeamSide[] =
    teams.winner === "b" ? ["b", "a"] : ["a", "b"];
  const groups = order
    .map((side) => ({
      side,
      members: players.filter((p) => p.team === side),
    }))
    .filter((g) => g.members.length > 0);
  const unplaced = players.filter((p) => p.team !== "a" && p.team !== "b");

  return (
    // The wrapper is the `ranking` container, so its own sizing can't query
    // it — that one reads the unnamed ancestor container (the broadcast's
    // <main>), exactly as the Swiss grid above does.
    <div className="@container/ranking flex w-full flex-col gap-4 @3xl:min-h-0 @3xl:flex-1">
      {groups.map(({ side, members }) => (
        <TeamRow
          key={side}
          side={side}
          name={teams.names[side]}
          outcome={
            teams.winner === null ? "tie" : teams.winner === side ? "won" : "lost"
          }
          members={members}
          highlightPlayerId={highlightPlayerId}
          teams={teams}
        />
      ))}
      {unplaced.length > 0 && (
        <TeamRow
          side={null}
          name="Unplaced"
          outcome="tie"
          members={unplaced}
          highlightPlayerId={highlightPlayerId}
          teams={teams}
        />
      )}
    </div>
  );
}

function TeamRow({
  side,
  name,
  outcome,
  members,
  highlightPlayerId,
  teams,
}: {
  side: TeamSide | null;
  name: string;
  outcome: "won" | "lost" | "tie";
  members: FinalRankingPlayer[];
  highlightPlayerId?: string;
  teams: FinalRankingTeams;
}) {
  const wins = members.reduce((n, p) => n + p.wins, 0);
  const losses = members.reduce((n, p) => n + p.losses, 0);
  const draws = members.reduce((n, p) => n + p.draws, 0);
  const cols = Math.max(members.length, 1);

  return (
    <section
      aria-label={`${name}: ${wins}-${losses}${draws ? `-${draws}` : ""}`}
      className="flex flex-col gap-2 @3xl/ranking:min-h-0 @3xl/ranking:flex-1"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 px-1">
        {side ? (
          <TeamChip side={side} label={name} />
        ) : (
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {name}
          </span>
        )}
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${
            side ? TEAM_STYLES[side].text : "text-zinc-400"
          }`}
        >
          {wins}–{losses}
          {draws > 0 && `–${draws}`}
        </span>
        {outcome === "won" && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-zinc-950">
            Winners
          </span>
        )}
        {outcome === "tie" && side && (
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-zinc-400">
            Tied
          </span>
        )}
      </header>
      <div
        className="grid grid-cols-1 gap-3 @xl/ranking:grid-cols-2 @2xl/ranking:grid-cols-3 @3xl/ranking:min-h-0 @3xl/ranking:flex-1 @3xl/ranking:justify-center @3xl/ranking:[grid-template-columns:var(--team-cols)]"
        style={{
          ["--team-cols" as string]: `repeat(${cols}, minmax(0, 22rem))`,
        }}
      >
        {members.map((p, i) => (
          <RankedCard
            key={p.playerId}
            player={p}
            rank={i + 1}
            total={members.length}
            highlight={p.playerId === highlightPlayerId}
            teams={teams}
          />
        ))}
      </div>
    </section>
  );
}

function RankedCard({
  player,
  rank,
  total,
  highlight,
  teams,
}: {
  player: FinalRankingPlayer;
  rank: number;
  total: number;
  highlight: boolean;
  teams: FinalRankingTeams | null;
}) {
  // In a team draft the event belongs to a team, not a player: the gold
  // "champion" treatment and the victory portrait go to every member of the
  // winning side, the defeat portrait to the other side.
  const isWinner = teams
    ? teams.winner !== null && player.team === teams.winner
    : rank === 1;
  const teamOutcome =
    teams && teams.winner && player.team
      ? player.team === teams.winner
        ? "won"
        : "lost"
      : null;
  const avatarUrl = avatarForRank(rank, total, player.avatars, teamOutcome);
  const rankColor =
    rank === 1
      ? "text-amber-300"
      : rank === 2
        ? "text-zinc-200"
        : rank === 3
          ? "text-amber-700"
          : "text-zinc-500";
  // In a team row the corner badge is the player's own match record — the
  // overall placing is the team's, and left-to-right already says who
  // carried the side.
  const recordColor =
    player.wins > player.losses
      ? "text-emerald-400"
      : player.wins < player.losses
        ? "text-red-400"
        : "text-zinc-300";

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
      <div
        className={`relative w-full aspect-[3/4] ${
          teams ? "@3xl/ranking:min-h-0 @3xl/ranking:flex-1 @3xl/ranking:aspect-auto" : ""
        }`}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[50%_25%]"
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
          className={`absolute left-2 top-2 z-10 rounded-lg bg-zinc-950/85 px-2.5 py-1 font-bold tabular-nums backdrop-blur ${
            teams ? recordColor : rankColor
          }`}
          style={{
            fontSize: "clamp(1rem, 8cqi, 2.4rem)",
            textShadow: "0 2px 8px rgba(0,0,0,0.9)",
          }}
        >
          {teams ? `${player.wins}–${player.losses}` : ordinal(rank)}
        </div>
        {/* Team rows name the side and the result in their header, so the
            card itself only carries the gold frame. */}
        {teams ? null : (
          isWinner && (
            <div
              className="absolute right-2 top-2 z-10 rounded-full bg-amber-500 px-2 py-0.5 font-bold uppercase tracking-[0.2em] text-zinc-950"
              style={{
                fontSize: "clamp(0.5rem, 2.4cqi, 0.7rem)",
              }}
            >
              Champion
            </div>
          )
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
