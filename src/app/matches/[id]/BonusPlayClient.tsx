"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  adjustLifeAction,
  endBonusGameAction,
  reportGameWinnerAction,
} from "@/app/events/actions";
import type { Game, Player } from "@/db/schema";
import type { EventMessage } from "@/lib/pubsub";
import { shouldApplyLifeChanged } from "@/lib/life-events";
import { LifePanel, avatarsFor } from "@/app/components/LifePanel";

type Props = {
  matchId: string;
  leagueSlug: string | null;
  leagueName: string;
  /** Set when this bonus game was started from inside an event — used to
   * watch for the next round starting so nobody misses their pairing. */
  eventId: string | null;
  mySide: "a" | "b";
  players: { a: Player; b: Player };
  startingLife: number;
  initialGame: Game;
  initialWins: { a: number; b: number };
};

/**
 * Bonus-game scorekeeper. Same sync architecture as the tournament
 * PlayClient (SSE fast path, 3s polling as the source of truth, CAS life
 * writes) but on the per-match channel, with an unbounded game tally and an
 * explicit "End Bonus Game" exit instead of best-of-3 completion.
 */
export function BonusPlayClient({
  matchId,
  leagueSlug,
  leagueName,
  eventId,
  mySide,
  players,
  startingLife,
  initialGame,
  initialWins,
}: Props) {
  const [aLife, setALife] = useState(initialGame.playerALife);
  const [bLife, setBLife] = useState(initialGame.playerBLife);
  const [wins, setWins] = useState(initialWins);
  const [roundStarted, setRoundStarted] = useState(false);
  const [pending, startTransition] = useTransition();
  // See PlayClient for the full reasoning behind these guards: in-flight
  // write counting keeps stale server snapshots from rubber-banding the
  // counter; the game-id ref keeps replayed events for a previous game from
  // rewinding it; per-side ts baselines reject out-of-order deliveries.
  const inFlight = useRef<{ a: number; b: number }>({ a: 0, b: 0 });
  const currentGameId = useRef<string>(initialGame.id);
  const lastTs = useRef<{ a: number; b: number }>({ a: 0, b: 0 });

  useEffect(() => {
    const es = new EventSource(`/api/matches/${matchId}/stream`);
    es.addEventListener("message", (e) => {
      let msg: EventMessage;
      try {
        msg = JSON.parse(e.data) as EventMessage;
      } catch {
        return;
      }
      if (msg.type === "life_changed" && msg.matchId === matchId) {
        const fresh = shouldApplyLifeChanged(
          {
            currentGameId: currentGameId.current,
            lastTsA: lastTs.current.a,
            lastTsB: lastTs.current.b,
          },
          msg
        );
        if (fresh) {
          if (msg.side === "a") {
            if (inFlight.current.a === 0) {
              setALife(msg.life);
              lastTs.current.a = msg.ts;
            }
          } else {
            if (inFlight.current.b === 0) {
              setBLife(msg.life);
              lastTs.current.b = msg.ts;
            }
          }
        }
      }
      if (msg.type === "game_complete" && msg.matchId === matchId) {
        if (msg.winnerId === players.a.id)
          setWins((w) => ({ ...w, a: w.a + 1 }));
        else if (msg.winnerId === players.b.id)
          setWins((w) => ({ ...w, b: w.b + 1 }));
        setALife(startingLife);
        setBLife(startingLife);
        inFlight.current = { a: 0, b: 0 };
        lastTs.current = { a: 0, b: 0 };
        currentGameId.current = msg.newGameId;
      }
      // Ended on either phone → the server page renders the final tally.
      // A started event carrying a different matchId is the pair moving on
      // to a fresh bonus game — follow them.
      if (msg.type === "bonus_game_ended" && msg.matchId === matchId) {
        window.location.reload();
      }
      if (msg.type === "bonus_game_started" && msg.matchId !== matchId) {
        window.location.href = `/matches/${msg.matchId}`;
      }
    });
    return () => es.close();
  }, [matchId, players.a.id, players.b.id, startingLife]);

  // Watch the parent event (when there is one) for the next round starting —
  // a banner, not an auto-redirect, so a game mid-turn isn't yanked away.
  useEffect(() => {
    if (!eventId) return;
    const es = new EventSource(`/api/events/${eventId}/stream`);
    es.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(e.data) as EventMessage;
        if (msg.type === "round_started") setRoundStarted(true);
      } catch {
        /* ignore non-JSON heartbeats */
      }
    });
    return () => es.close();
  }, [eventId]);

  // Belt-and-suspenders polling — see PlayClient.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}/state`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const s = (await res.json()) as {
          status: "pending" | "in_progress" | "complete";
          life: { a: number | null; b: number | null };
          wins: { a: number; b: number };
          activeGameId: string | null;
        };
        if (stopped) return;
        if (s.status === "complete") {
          window.location.reload();
          return;
        }
        if (s.activeGameId && s.activeGameId !== currentGameId.current) {
          currentGameId.current = s.activeGameId;
          lastTs.current = { a: 0, b: 0 };
        }
        if (s.life.a !== null && inFlight.current.a === 0) {
          setALife((cur) => (cur !== s.life.a ? (s.life.a as number) : cur));
        }
        if (s.life.b !== null && inFlight.current.b === 0) {
          setBLife((cur) => (cur !== s.life.b ? (s.life.b as number) : cur));
        }
        setWins((w) => (w.a === s.wins.a && w.b === s.wins.b ? w : s.wins));
      } catch {
        /* network blip — next tick retries */
      }
    };
    const id = setInterval(tick, 3000);
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [matchId]);

  // Keep the phone awake during the game — same approach as PlayClient.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock?.request("screen");
      } catch {
        /* user gesture missing, permission denied, or unsupported */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, []);

  const myLife = mySide === "a" ? aLife : bLife;
  const oppLife = mySide === "a" ? bLife : aLife;
  const me = mySide === "a" ? players.a : players.b;
  const opp = mySide === "a" ? players.b : players.a;
  const myWins = mySide === "a" ? wins.a : wins.b;
  const oppWins = mySide === "a" ? wins.b : wins.a;

  const adjust = (side: "a" | "b", delta: number) => {
    const expectedLife = side === "a" ? aLife : bLife;
    const gameId = currentGameId.current;
    if (side === "a") setALife((v) => v + delta);
    else setBLife((v) => v + delta);
    inFlight.current[side] += 1;
    startTransition(async () => {
      try {
        const res = await adjustLifeAction({
          matchId,
          side,
          delta,
          gameId,
          expectedLife,
        });
        if (res.life !== null) {
          if (side === "a") setALife(res.life);
          else setBLife(res.life);
        }
      } finally {
        inFlight.current[side] = Math.max(0, inFlight.current[side] - 1);
      }
    });
  };
  const oppSide = mySide === "a" ? "b" : "a";

  const reportWinner = (winnerSide: "me" | "opp") => {
    const winnerId = winnerSide === "me" ? me.id : opp.id;
    startTransition(async () => {
      await reportGameWinnerAction({
        matchId,
        winnerId,
        gameId: currentGameId.current,
      });
    });
  };

  const endGame = () => {
    if (
      !window.confirm(
        "End this bonus game? The tally stays as the final score."
      )
    ) {
      return;
    }
    startTransition(async () => {
      await endBonusGameAction({ matchId });
      window.location.reload();
    });
  };

  return (
    <main className="mx-auto flex max-w-md w-full flex-col gap-6 px-4 py-4 landscape:h-dvh landscape:max-w-4xl landscape:gap-2 landscape:overflow-hidden landscape:py-2">
      {roundStarted && eventId && (
        <Link
          href={`/events/${eventId}/play`}
          className="rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-3 text-center text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          The next round just started — tap to go to your table
        </Link>
      )}
      <nav className="flex flex-wrap gap-2 text-sm landscape:hidden">
        {leagueSlug && (
          <Link
            href={`/leagues/${leagueSlug}`}
            className="rounded-md px-2 py-1 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            League
          </Link>
        )}
      </nav>
      <div className="hidden items-center justify-between gap-3 text-xs text-zinc-400 landscape:flex">
        <span className="min-w-0 truncate">
          <span className="font-semibold text-amber-300">Bonus Game</span>
          <span className="text-zinc-500"> · {leagueName}</span>
        </span>
        <span className="shrink-0 tabular-nums">
          {oppWins} <span className="text-zinc-500">games</span> {myWins}
        </span>
      </div>
      <header className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 landscape:hidden">
        <div className="mb-3 min-w-0">
          <div className="truncate text-lg font-semibold text-amber-300">
            Bonus Game
          </div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            {leagueName} · just for fun
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              You
            </div>
            <div className="text-lg font-semibold">{me.displayName}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              vs
            </div>
            <div className="text-lg font-semibold">{opp.displayName}</div>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-center gap-3 text-sm landscape:hidden">
        <span className="text-2xl font-bold tabular-nums">{myWins}</span>
        <span className="text-zinc-500">games</span>
        <span className="text-2xl font-bold tabular-nums">{oppWins}</span>
      </div>

      {/* Portrait stacks opponent above you — your counter sits nearest you
          with the phone on the table. Landscape puts you side-by-side,
          opponent left, you right. */}
      <div className="flex min-h-0 flex-col gap-6 landscape:flex-1 landscape:flex-row landscape:gap-3">
        <LifePanel
          label={opp.displayName}
          life={oppLife}
          startingLife={startingLife}
          avatars={avatarsFor(opp)}
          onAdjust={(d) => adjust(oppSide, d)}
          pending={pending}
        />

        <LifePanel
          label={`${me.displayName} (you)`}
          life={myLife}
          startingLife={startingLife}
          avatars={avatarsFor(me)}
          onAdjust={(d) => adjust(mySide, d)}
          pending={pending}
          emphasized
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => reportWinner("opp")}
          disabled={pending}
          className="rounded-xl bg-zinc-700 py-3 font-semibold transition hover:bg-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-50"
        >
          They won
        </button>
        <button
          onClick={() => reportWinner("me")}
          disabled={pending}
          className="rounded-xl bg-emerald-500 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 disabled:opacity-50"
        >
          I won this game
        </button>
      </div>

      <button
        onClick={endGame}
        disabled={pending}
        className="rounded-xl border border-zinc-700 bg-zinc-950 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-50 landscape:py-1.5 landscape:text-xs"
      >
        End Bonus Game
      </button>
    </main>
  );
}
