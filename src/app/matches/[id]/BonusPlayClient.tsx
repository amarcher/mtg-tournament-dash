"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useWakeLock } from "@/lib/use-wake-lock";
import {
  adjustLifeAction,
  endBonusGameAction,
  reportGameWinnerAction,
} from "@/app/events/actions";
import type { Game, Player } from "@/db/schema";
import type { EventMessage } from "@/lib/pubsub";
import { shouldApplyLifeChanged } from "@/lib/life-events";
import { avatarsFor } from "@/app/components/LifePanel";
import { Scoreboard } from "@/app/components/Scoreboard";

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
  // Life taps and the outcome buttons get separate transitions on purpose.
  // Sharing one meant every life tap flipped the outcome buttons' pending
  // flag, blinking them disabled on each tap. Life's pending is deliberately
  // unread — those taps are optimistic and never gate the UI.
  const [, startLifeTransition] = useTransition();
  const [outcomePending, startOutcomeTransition] = useTransition();
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

  useWakeLock();

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
    startLifeTransition(async () => {
      try {
        const res = await adjustLifeAction({
          matchId,
          side,
          delta,
          gameId,
          expectedLife,
        });
        // Only the last write still in flight may publish the server's value.
        // An earlier response landing while later taps are pending describes a
        // life total the user has already tapped past, and applying it rewinds
        // the counter — the visible jitter during fast tapping.
        if (res.life !== null && inFlight.current[side] === 1) {
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
    startOutcomeTransition(async () => {
      await reportGameWinnerAction({
        matchId,
        winnerId,
        gameId: currentGameId.current,
      });
    });
  };

  const endGame = () => {
    startOutcomeTransition(async () => {
      await endBonusGameAction({ matchId });
      window.location.reload();
    });
  };

  return (
    <Scoreboard
      backHref={leagueSlug ? `/leagues/${leagueSlug}` : "/"}
      title={`Bonus game · ${leagueName}`}
      status={
        <span className="font-display text-sm font-bold tabular-nums text-gold">
          {myWins}
          <span className="px-1.5 text-ink-faint">–</span>
          {oppWins}
        </span>
      }
      banner={
        roundStarted && eventId ? (
          <Link
            href={`/events/${eventId}/play`}
            className="block rounded-[14px] border border-emerald-400/50 bg-emerald-500/15 px-4 py-3 text-center text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            The next round just started. Tap to go to your table →
          </Link>
        ) : undefined
      }
      opponent={{
        name: opp.displayName,
        detail: `${oppWins} win${oppWins === 1 ? "" : "s"}`,
        life: oppLife,
        avatars: avatarsFor(opp),
        onAdjust: (d) => adjust(oppSide, d),
      }}
      me={{
        name: `You · ${me.displayName}`,
        detail: `${myWins} win${myWins === 1 ? "" : "s"}`,
        life: myLife,
        avatars: avatarsFor(me),
        onAdjust: (d) => adjust(mySide, d),
      }}
      startingLife={startingLife}
      onIWon={() => reportWinner("me")}
      onTheyWon={() => reportWinner("opp")}
      outcomeDisabled={outcomePending}
      menu={[
        {
          label: "End bonus game",
          confirm: "The tally stays as the final score.",
          tone: "danger",
          onSelect: endGame,
        },
        { label: "Edit my portrait", href: `/players/${me.id}` },
        ...(eventId
          ? [{ label: "Back to the tournament", href: `/events/${eventId}/play` }]
          : []),
        ...(leagueSlug
          ? [{ label: "League", href: `/leagues/${leagueSlug}` }]
          : []),
      ]}
    />
  );
}
