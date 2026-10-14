"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useWakeLock } from "@/lib/use-wake-lock";
import {
  endBonusGameAction,
  reportGameWinnerAction,
  undoLastGameWinAction,
} from "@/app/events/actions";
import { useLifeHistory } from "@/lib/use-life-history";
import type { Game, Player } from "@/db/schema";
import type { EventMessage } from "@/lib/pubsub";
import { remoteEditLockMs, shouldApplyLifeChanged } from "@/lib/life-events";
import { useLifeWriter } from "@/lib/use-life-writer";
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
  // Only the outcome buttons use a transition. Life taps are optimistic and
  // go through useLifeWriter, so they never flip this pending flag.
  const [outcomePending, startOutcomeTransition] = useTransition();
  // See PlayClient for the reasoning behind these guards: the game-id ref
  // keeps replayed events for a previous game from rewinding the counter;
  // per-side ts baselines reject out-of-order deliveries.
  const currentGameId = useRef<string>(initialGame.id);
  const lastTs = useRef<{ a: number; b: number }>({ a: 0, b: 0 });
  const { adjust, inFlight, locked, lockSide } = useLifeWriter({
    matchId,
    currentGameId,
    lives: { a: aLife, b: bLife },
    setLife: (side, next) => (side === "a" ? setALife : setBLife)(next),
  });

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
          lockSide(msg.side, remoteEditLockMs(msg, mySide, Date.now()));
          if (msg.side === "a") {
            if (!inFlight.current.a) {
              setALife(msg.life);
              lastTs.current.a = msg.ts;
            }
          } else {
            if (!inFlight.current.b) {
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
        lastTs.current = { a: 0, b: 0 };
        currentGameId.current = msg.newGameId;
      }
      // Ended on either phone → the server page renders the final tally.
      // A started event carrying a different matchId is the pair moving on
      // to a fresh bonus game — follow them.
      if (
        (msg.type === "bonus_game_ended" || msg.type === "game_reopened") &&
        msg.matchId === matchId
      ) {
        window.location.reload();
      }
      if (msg.type === "bonus_game_started" && msg.matchId !== matchId) {
        window.location.href = `/matches/${msg.matchId}`;
      }
    });
    return () => es.close();
  }, [matchId, mySide, inFlight, lockSide, players.a.id, players.b.id, startingLife]);

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
        if (s.life.a !== null && !inFlight.current.a) {
          setALife((cur) => (cur !== s.life.a ? (s.life.a as number) : cur));
        }
        if (s.life.b !== null && !inFlight.current.b) {
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
  }, [matchId, inFlight]);

  useWakeLock();
  const getHistory = useLifeHistory(currentGameId, aLife, bLife);

  const myLife = mySide === "a" ? aLife : bLife;
  const oppLife = mySide === "a" ? bLife : aLife;
  const me = mySide === "a" ? players.a : players.b;
  const opp = mySide === "a" ? players.b : players.a;
  const myWins = mySide === "a" ? wins.a : wins.b;
  const oppWins = mySide === "a" ? wins.b : wins.a;

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

  const undoLastGame = () => {
    startOutcomeTransition(async () => {
      try {
        await undoLastGameWinAction({
          matchId,
          gameId: currentGameId.current,
        });
      } finally {
        window.location.reload();
      }
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
        <span className="font-numeral text-sm font-bold tabular-nums text-gold">
          {myWins}
          <span className="px-1.5 text-ink-faint">–</span>
          {oppWins}
        </span>
      }
      banner={
        roundStarted && eventId ? (
          <Link
            href={`/events/${eventId}/play`}
            className="block rounded-[10px] border border-emerald-400/50 bg-emerald-500/15 px-4 py-3 text-center text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            The next round just started. Tap to go to your table →
          </Link>
        ) : undefined
      }
      opponent={{
        side: oppSide,
        name: opp.displayName,
        detail: `${oppWins} win${oppWins === 1 ? "" : "s"}`,
        life: oppLife,
        avatars: avatarsFor(opp),
        onAdjust: (d) => adjust(oppSide, d),
        lockedBy: locked[oppSide] ? opp.displayName : null,
      }}
      me={{
        side: mySide,
        name: `You · ${me.displayName}`,
        detail: `${myWins} win${myWins === 1 ? "" : "s"}`,
        life: myLife,
        avatars: avatarsFor(me),
        onAdjust: (d) => adjust(mySide, d),
        lockedBy: locked[mySide] ? opp.displayName : null,
      }}
      startingLife={startingLife}
      onIWon={() => reportWinner("me")}
      onTheyWon={() => reportWinner("opp")}
      outcomeDisabled={outcomePending}
      getHistory={getHistory}
      menu={[
        ...(myWins + oppWins > 0
          ? [
              {
                label: "Undo last game result",
                confirm:
                  "Reopens the last game with its life totals. Anything played since is discarded.",
                onSelect: undoLastGame,
              },
            ]
          : []),
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
