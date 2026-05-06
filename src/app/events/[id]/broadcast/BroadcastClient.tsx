"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { EventMessage } from "@/lib/pubsub";
import { pickAvatarUrl, type AvatarTiers } from "@/lib/avatar-tier";

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
  currentRoundNumber,
  roundStartedAtIso,
  initialMatches,
  initialStandings,
  claimUrl,
  claimQrDataUrl,
  claimHostLabel,
}: Props) {
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

  // Pick a roughly-square grid for any match count. Most events are ≤4
  // matches (1×N) or 4 (2×2); larger nights drop into multi-row layouts so
  // the cards never get squished into thin columns.
  const matchCount = matches.length;
  const matchGridStyle: React.CSSProperties = (() => {
    if (matchCount <= 1)
      return { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" };
    if (matchCount <= 3)
      return {
        gridTemplateColumns: `repeat(${matchCount}, minmax(0, 1fr))`,
        gridTemplateRows: "1fr",
      };
    if (matchCount === 4)
      return {
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
      };
    if (matchCount <= 6)
      return {
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gridTemplateRows: "repeat(2, minmax(0, 1fr))",
      };
    if (matchCount <= 8)
      return {
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gridTemplateRows: "repeat(2, minmax(0, 1fr))",
      };
    // 9+: square-ish auto layout.
    const cols = Math.ceil(Math.sqrt(matchCount));
    const rows = Math.ceil(matchCount / cols);
    return {
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    };
  })();

  // Standings: single row when it fits, wrap when there are too many.
  const standingsStyle: React.CSSProperties = {
    gridTemplateColumns:
      standings.length <= 8
        ? `repeat(${Math.max(standings.length, 1)}, minmax(0, 1fr))`
        : "repeat(auto-fit, minmax(180px, 1fr))",
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* JOIN QR — small persistent overlay so phones can scan in from
          anywhere in the room without typing a LAN URL. Bottom-right keeps it
          out of the headline life-total grid; pointer-events-none so it never
          intercepts clicks if a future remote-control mode lands. */}
      <a
        href={claimUrl}
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto absolute bottom-3 right-3 z-30 flex w-[140px] flex-col items-center rounded-xl border border-zinc-700/80 bg-zinc-900/90 p-2 shadow-lg backdrop-blur"
        aria-label="Open claim page"
      >
        <div className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-amber-400">
          Join
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={claimQrDataUrl}
          alt="Scan to claim your seat"
          className="mt-1 h-[112px] w-[112px] rounded bg-white p-1"
        />
        <div className="mt-1 max-w-full truncate font-mono text-[0.6rem] text-zinc-400">
          {claimHostLabel}
        </div>
      </a>
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-12 py-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {event.name}
          </h1>
          <div className="mt-0.5 text-xs uppercase tracking-[0.2em] text-zinc-500">
            {currentRoundNumber
              ? `Round ${currentRoundNumber} of ${event.totalRounds}`
              : "Awaiting round start"}
          </div>
        </div>
        <RoundTimer
          startedAtIso={roundStartedAtIso}
          durationSec={event.roundDurationSec}
        />
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 px-8 py-6">
        <section
          className="grid min-h-0 flex-1 gap-4"
          style={matchGridStyle}
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
          <div className="grid gap-2" style={standingsStyle}>
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
        <div className="font-mono text-5xl font-bold tabular-nums text-zinc-700">
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
        className={`font-mono text-5xl font-bold tabular-nums tracking-tight ${
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
        className="relative flex flex-col items-center justify-center rounded-2xl border border-amber-500/40 bg-zinc-900 p-6"
      >
        <div className="absolute left-4 top-3 text-[0.65rem] uppercase tracking-[0.25em] text-zinc-500">
          Table {match.tableNumber}
        </div>
        <div className="absolute right-4 top-3 text-[0.65rem] uppercase tracking-[0.25em] text-amber-400">
          BYE
        </div>
        <div className="text-3xl font-semibold">{match.playerA.name}</div>
        <div className="mt-2 text-sm text-zinc-500">automatic win</div>
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

      <div className="mt-1 grid min-h-0 flex-1 grid-cols-2 gap-2">
        <PlayerSide
          playerId={match.playerA.id}
          name={match.playerA.name}
          life={match.playerA.life}
          wins={match.playerA.wins}
          avatars={match.playerA.avatars}
          startingLife={startingLife}
          pulse={pulses[`${match.matchId}:a`]}
          isWinner={match.winnerId === match.playerA.id}
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
}: {
  playerId: string;
  name: string;
  life: number;
  wins: number;
  avatars: AvatarTiers;
  startingLife: number;
  pulse?: "damage" | "heal";
  isWinner?: boolean;
}) {
  const lifeColor =
    life <= 5
      ? "text-red-400"
      : life < startingLife / 2
        ? "text-amber-300"
        : "text-zinc-100";

  // Tier-pick logic lives in src/lib/avatar-tier.ts so we can unit-test the
  // boundaries + cascading fallbacks without spinning up React.
  const activeUrl = pickAvatarUrl(life, startingLife, avatars);

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

      {/* readability scrim — radial dark in the middle where the digits land,
          plus a stronger bottom gradient to anchor name + life. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.7) 100%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

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

      {/* life total (the headline number, centered) */}
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <motion.div
          key={life}
          initial={{ scale: 1.18 }}
          animate={{ scale: 1 }}
          className={`font-bold leading-none tabular-nums ${lifeColor}`}
          style={{
            fontSize: "clamp(3rem, 50cqi, 13rem)",
            textShadow:
              "0 4px 22px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)",
          }}
        >
          {life}
        </motion.div>
      </div>

      {/* name + game pips, anchored to bottom over the gradient */}
      <div className="relative z-10 flex w-full flex-col items-center gap-1">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
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
