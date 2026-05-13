"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { EventMessage } from "@/lib/pubsub";
import {
  pickAvatarUrl,
  pickMatchOutcomeAvatar,
  type AvatarTiers,
} from "@/lib/avatar-tier";
import { FinalRanking, type FinalRankingPlayer } from "../FinalRanking";

export type { AvatarTiers };

export type BroadcastMatch = {
  matchId: string;
  tableNumber: number;
  status: "pending" | "in_progress" | "complete";
  winnerId: string | null;
  playerA: {
    id: string;
    name: string;
    life: number;
    wins: number;
    avatars: AvatarTiers;
  };
  playerB: {
    id: string;
    name: string;
    life: number;
    wins: number;
    avatars: AvatarTiers;
  } | null;
  activeGameId: string | null;
};

type Standing = {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
  currentElo: number;
  avatarUrl: string | null;
};

type Props = {
  eventId: string;
  event: {
    name: string;
    totalRounds: number;
    startingLife: number;
    roundDurationSec: number;
  };
  eventStatus: "draft" | "active" | "complete";
  finalRanking: FinalRankingPlayer[];
  currentRoundNumber: number | null;
  roundStartedAtIso: string | null;
  initialMatches: BroadcastMatch[];
  initialStandings: Standing[];
  claimUrl: string;
  claimQrDataUrl: string;
  claimHostLabel: string;
};

export function BroadcastClient({
  eventId,
  event,
  eventStatus,
  finalRanking,
  currentRoundNumber,
  roundStartedAtIso,
  initialMatches,
  initialStandings,
  claimUrl,
  claimQrDataUrl,
  claimHostLabel,
}: Props) {
  const isEventComplete = eventStatus === "complete";
  const [matches, setMatches] = useState(initialMatches);
  const [standings] = useState(initialStandings);
  const [pulses, setPulses] = useState<
    Record<string, "damage" | "heal" | undefined>
  >({});
  const pulseTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const es = new EventSource(`/api/events/${eventId}/stream`);
    es.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data) as EventMessage;
      if (msg.type === "life_changed") {
        setMatches((prev) =>
          prev.map((m) => {
            if (m.matchId !== msg.matchId) return m;
            const sideKey = msg.side === "a" ? "playerA" : "playerB";
            const side = m[sideKey];
            if (!side) return m;
            const oldLife = side.life;
            const next = msg.life;
            const key = `${m.matchId}:${msg.side}`;
            const direction: "damage" | "heal" =
              next < oldLife ? "damage" : "heal";
            setPulses((p) => ({ ...p, [key]: direction }));
            clearTimeout(pulseTimers.current[key]);
            pulseTimers.current[key] = setTimeout(() => {
              setPulses((p) => ({ ...p, [key]: undefined }));
            }, 600);
            return {
              ...m,
              [sideKey]: { ...side, life: next },
            };
          })
        );
      } else if (
        msg.type === "match_complete" ||
        msg.type === "game_complete" ||
        msg.type === "round_started" ||
        msg.type === "round_completed"
      ) {
        // Hard refresh — server has the source of truth.
        window.location.reload();
      }
    });
    return () => es.close();
  }, [eventId]);

  // Wide-viewport match grid — kept as the original near-square layout so the
  // TV broadcast still looks like a TV broadcast. At narrow widths a sibling
  // container-query rule below overrides this with a single column, so the
  // values here only kick in once the broadcast cell is comfortably wide.
  const matchCount = matches.length;
  const wideMatchCols = (() => {
    if (matchCount <= 1) return 1;
    if (matchCount <= 3) return matchCount;
    if (matchCount === 4) return 2;
    if (matchCount <= 6) return 3;
    if (matchCount <= 8) return 4;
    return Math.ceil(Math.sqrt(matchCount));
  })();
  const wideMatchRows = Math.max(1, Math.ceil(matchCount / wideMatchCols));

  // Standings strip uses the same `@3xl` threshold as the match grid — below
  // that, auto-fit wrap keeps each cell at least ~150 px wide.
  const wideStandingsCols =
    standings.length <= 8 ? Math.max(standings.length, 1) : 0;

  return (
    <div className="fixed inset-0 flex flex-col overflow-y-auto bg-zinc-950 text-zinc-100">
      <header className="flex shrink-0 flex-col gap-3 border-b border-zinc-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-12 sm:py-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {event.name}
          </h1>
          <div className="mt-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500 sm:text-xs">
            {isEventComplete
              ? "Final results"
              : currentRoundNumber
                ? `Round ${currentRoundNumber} of ${event.totalRounds}`
                : "Awaiting round start"}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end sm:gap-6">
          <a
            href={claimUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900/90 px-2.5 py-1.5 shadow-sm hover:border-amber-500/60 sm:gap-3 sm:px-3 sm:py-2"
            aria-label="Open claim page"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={claimQrDataUrl}
              alt="Scan to claim your seat"
              className="h-10 w-10 rounded bg-white p-0.5 sm:h-14 sm:w-14"
            />
            <div className="flex flex-col">
              <div className="text-[0.55rem] font-semibold uppercase tracking-[0.3em] text-amber-400 sm:text-[0.6rem]">
                Join
              </div>
              <div className="max-w-[160px] truncate font-mono text-[0.6rem] text-zinc-400 sm:max-w-[180px] sm:text-[0.65rem]">
                {claimHostLabel}
              </div>
            </div>
          </a>
          <RoundTimer
            startedAtIso={roundStartedAtIso}
            durationSec={event.roundDurationSec}
          />
        </div>
      </header>

      <main className="@container flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-8 sm:py-6">
        {isEventComplete ? (
          <FinalRanking players={finalRanking} />
        ) : (
          <>
            <section
              className="grid min-h-0 flex-1 grid-cols-1 gap-3 @3xl:[grid-template-columns:var(--match-cols)] @3xl:[grid-template-rows:var(--match-rows)] @3xl:gap-4"
              style={
                {
                  ["--match-cols" as string]: `repeat(${wideMatchCols}, minmax(0, 1fr))`,
                  ["--match-rows" as string]: `repeat(${wideMatchRows}, minmax(0, 1fr))`,
                } as React.CSSProperties
              }
            >
              {matchCount === 0 && (
                <div className="flex items-center justify-center text-zinc-600">
                  No active round.
                </div>
              )}
              {matches.map((m) => (
                <MatchCard
                  key={m.matchId}
                  match={m}
                  pulses={pulses}
                  startingLife={event.startingLife}
                />
              ))}
            </section>

            <section className="shrink-0">
              <div className="mb-1 text-[0.65rem] uppercase tracking-[0.25em] text-zinc-500">
                Standings
              </div>
              <div
                className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] @3xl:[grid-template-columns:var(--standings-cols)]"
                style={
                  wideStandingsCols > 0
                    ? ({
                        ["--standings-cols" as string]: `repeat(${wideStandingsCols}, minmax(0, 1fr))`,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                {standings.map((s, i) => (
                  <div
                    key={s.playerId}
                    className="flex items-center gap-2 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5"
                  >
                    {s.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.avatarUrl}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-zinc-700"
                      />
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-800 font-mono text-[0.65rem] text-zinc-500">
                        {i + 1}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {s.displayName}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-400">
                      {s.wins}-{s.losses}
                      {s.draws > 0 ? `-${s.draws}` : ""} · {s.currentElo}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function RoundTimer({
  startedAtIso,
  durationSec,
}: {
  startedAtIso: string | null;
  durationSec: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!startedAtIso) {
    return (
      <div className="text-right">
        <div className="font-mono text-3xl font-bold tabular-nums sm:text-5xl text-zinc-700">
          {fmt(durationSec)}
        </div>
        <div className="text-[0.65rem] uppercase tracking-[0.25em] text-zinc-600">
          round timer
        </div>
      </div>
    );
  }

  const startedMs = new Date(startedAtIso).getTime();
  const elapsedSec = Math.floor((now - startedMs) / 1000);
  const remaining = durationSec - elapsedSec;
  const overtime = remaining < 0;
  const lowTime = !overtime && remaining < 5 * 60;

  return (
    <div className="text-right">
      <div
        className={`font-mono text-3xl font-bold tabular-nums sm:text-5xl tracking-tight ${
          overtime
            ? "text-red-500"
            : lowTime
              ? "text-amber-400"
              : "text-zinc-100"
        }`}
      >
        {overtime ? `+${fmt(-remaining)}` : fmt(remaining)}
      </div>
      <div
        className={`text-[0.65rem] uppercase tracking-[0.25em] ${
          overtime ? "text-red-500" : "text-zinc-500"
        }`}
      >
        {overtime ? "time — finish current turn" : "round timer"}
      </div>
    </div>
  );
}

function fmt(totalSec: number) {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function MatchCard({
  match,
  pulses,
  startingLife,
}: {
  match: BroadcastMatch;
  pulses: Record<string, "damage" | "heal" | undefined>;
  startingLife: number;
}) {
  const isComplete = match.status === "complete";
  const winnerName =
    isComplete && match.winnerId
      ? match.winnerId === match.playerA.id
        ? match.playerA.name
        : match.playerB?.name
      : null;

  if (match.playerB === null) {
    return (
      <motion.div
        layout
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-amber-500/40 bg-zinc-900 p-3"
      >
        <div className="z-10 flex shrink-0 items-baseline justify-between text-[0.65rem] uppercase tracking-[0.25em] text-zinc-400">
          <span>Table {match.tableNumber}</span>
          <span className="text-amber-400">BYE</span>
        </div>
        <div className="mt-1 grid min-h-0 flex-1 grid-cols-2 gap-2">
          <PlayerSide
            playerId={match.playerA.id}
            name={match.playerA.name}
            life={match.playerA.life}
            wins={match.playerA.wins}
            avatars={match.playerA.avatars}
            startingLife={startingLife}
            isWinner
            outcome="won"
          />
          <ByeSide />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      className={`relative flex min-h-0 flex-col rounded-2xl border ${
        isComplete
          ? "border-amber-500/50 bg-zinc-900"
          : "border-zinc-800 bg-zinc-900"
      } overflow-hidden p-3`}
    >
      <div className="z-10 flex shrink-0 items-baseline justify-between text-[0.65rem] uppercase tracking-[0.25em] text-zinc-400">
        <span>Table {match.tableNumber}</span>
        <span>
          Game {Math.min(3, match.playerA.wins + match.playerB.wins + 1)}
        </span>
      </div>

      <div className="relative mt-1 grid min-h-0 flex-1 grid-cols-2 gap-2">
        <PlayerSide
          playerId={match.playerA.id}
          name={match.playerA.name}
          life={match.playerA.life}
          wins={match.playerA.wins}
          avatars={match.playerA.avatars}
          startingLife={startingLife}
          pulse={pulses[`${match.matchId}:a`]}
          isWinner={match.winnerId === match.playerA.id}
          outcome={
            isComplete
              ? match.winnerId === match.playerA.id
                ? "won"
                : "lost"
              : null
          }
        />
        <PlayerSide
          playerId={match.playerB.id}
          name={match.playerB.name}
          life={match.playerB.life}
          wins={match.playerB.wins}
          avatars={match.playerB.avatars}
          startingLife={startingLife}
          pulse={pulses[`${match.matchId}:b`]}
          isWinner={match.winnerId === match.playerB.id}
          outcome={
            isComplete
              ? match.winnerId === match.playerB.id
                ? "won"
                : "lost"
              : null
          }
        />
      </div>

      <AnimatePresence>
        {isComplete && winnerName && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-4 bottom-4 z-20 rounded-lg bg-amber-500 px-4 py-2 text-center text-sm font-bold uppercase tracking-[0.25em] text-zinc-950"
          >
            {winnerName} wins
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PlayerSide({
  playerId,
  name,
  life,
  wins,
  avatars,
  startingLife,
  pulse,
  isWinner,
  outcome,
}: {
  playerId: string;
  name: string;
  life: number;
  wins: number;
  avatars: AvatarTiers;
  startingLife: number;
  pulse?: "damage" | "heal";
  isWinner?: boolean;
  /** "won" | "lost" once the match resolves; null while still in progress. */
  outcome?: "won" | "lost" | null;
}) {
  const lifeColor =
    life <= 5
      ? "text-red-400"
      : life < startingLife / 2
        ? "text-amber-300"
        : "text-zinc-100";

  // When the match is over, show the outcome portrait (victory/defeat).
  // Otherwise, pick by life total. Both call paths cascade through
  // sibling tiers when the preferred portrait is missing.
  const activeUrl = outcome
    ? pickMatchOutcomeAvatar(outcome, avatars)
    : pickAvatarUrl(life, startingLife, avatars);

  return (
    <div
      className={`group relative flex min-h-0 flex-col items-center justify-end overflow-hidden rounded-xl px-3 pb-3 pt-2 ${
        isWinner ? "ring-2 ring-amber-500/70" : "ring-1 ring-zinc-800"
      }`}
      style={{ containerType: "inline-size" }}
    >
      {/* wizard background — crossfades when the life-tier swaps */}
      <AnimatePresence>
        {activeUrl ? (
          <motion.img
            key={activeUrl}
            src={activeUrl}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <motion.div
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-zinc-950/40"
          />
        )}
      </AnimatePresence>

      {/* hover-only regen affordance — invisible on touch devices, visible on
          a laptop running the broadcast view so the organizer can pop into
          /players/[id] in a new tab without leaving the show. */}
      <a
        href={`/players/${playerId}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Regenerate portrait for ${name}`}
        className="pointer-events-auto absolute right-1.5 top-1.5 z-20 grid h-7 w-7 place-items-center rounded-full bg-zinc-950/70 text-sm text-amber-300 opacity-0 ring-1 ring-amber-400/50 transition hover:bg-zinc-900 group-hover:opacity-100 hover:opacity-100"
      >
        ↺
      </a>

      {/* readability scrim — keep the face bright (light wash only) and pile
          the darkness into the bottom third where the life total + name sit. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.4) 100%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/70 to-transparent" />

      {/* damage / heal pulse overlay (in front of scrim, behind text) */}
      <AnimatePresence>
        {pulse && (
          <motion.div
            key={pulse + life}
            initial={{ opacity: 0.6, scale: 0.9 }}
            animate={{ opacity: 0, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className={`pointer-events-none absolute inset-0 ${
              pulse === "damage" ? "bg-red-600/45" : "bg-emerald-500/40"
            }`}
          />
        )}
      </AnimatePresence>

      {/* Big number — life total during play, swaps to games won once the
          match is complete (so the two sides read together as e.g. "2 – 0"
          via the dash overlay on the parent). */}
      <div className="relative z-10 flex flex-1 items-end justify-center pb-1">
        <motion.div
          key={outcome ? `wins-${wins}` : `life-${life}`}
          initial={{ scale: 1.18 }}
          animate={{ scale: 1 }}
          className={`font-bold leading-none tabular-nums ${
            outcome
              ? outcome === "won"
                ? "text-amber-300"
                : "text-zinc-400"
              : lifeColor
          }`}
          style={{
            fontSize: "clamp(2.5rem, 38cqi, 11rem)",
            textShadow:
              "0 4px 22px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,1)",
          }}
        >
          {outcome ? wins : life}
        </motion.div>
      </div>

      {/* name + game pips, anchored to bottom over the gradient. Best-of-3 →
          first to 2 wins, so only two pips. */}
      <div className="relative z-10 flex w-full flex-col items-center gap-1">
        <div className="flex gap-1.5">
          {[0, 1].map((i) => (
            <span
              key={i}
              className={
                i < wins
                  ? "h-2 w-2 rounded-full bg-amber-400 ring-1 ring-amber-300/40"
                  : "h-2 w-2 rounded-full border border-zinc-400/60"
              }
            />
          ))}
        </div>
        <div
          className="max-w-full truncate text-center text-xl font-semibold tracking-tight text-white"
          style={{
            textShadow: "0 2px 8px rgba(0,0,0,0.9)",
          }}
        >
          {name}
        </div>
      </div>
    </div>
  );
}

// Empty-opponent placeholder for the "bye" side of an automatic-win match.
// Mirrors PlayerSide's silhouette so the bye card looks like a real two-up
// matchup instead of one giant text panel.
function ByeSide() {
  return (
    <div
      className="relative flex min-h-0 flex-col items-center justify-end overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-800"
      style={{ containerType: "inline-size" }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(245,158,11,0.10),transparent_60%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/70 to-transparent" />
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <div
          className="font-bold tracking-[0.3em] text-amber-400/60"
          style={{
            fontSize: "clamp(1.5rem, 14cqi, 4rem)",
            textShadow: "0 4px 18px rgba(0,0,0,0.9)",
          }}
        >
          BYE
        </div>
      </div>
      <div className="relative z-10 flex w-full flex-col items-center gap-1 pb-2">
        <div className="text-[0.55rem] uppercase tracking-[0.3em] text-zinc-500">
          no opponent
        </div>
        <div
          className="text-base font-medium tracking-tight text-zinc-300"
          style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}
        >
          rests this round
        </div>
      </div>
    </div>
  );
}
