"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useWakeLock } from "@/lib/use-wake-lock";
import {
  adjustLifeAction,
  reportGameWinnerAction,
  reportMatchDrawAction,
} from "@/app/events/actions";
import type { Game, Player } from "@/db/schema";
import type { EventMessage } from "@/lib/pubsub";
import { shouldApplyLifeChanged } from "@/lib/life-events";
import { avatarsFor } from "@/app/components/LifePanel";
import { GamePips, Scoreboard } from "@/app/components/Scoreboard";

type Props = {
  eventId: string;
  eventName: string;
  leagueSlug: string | null;
  tableNumber: number;
  matchId: string;
  mySide: "a" | "b";
  players: { a: Player; b: Player | null };
  startingLife: number;
  initialGame: Game;
  initialWins: { a: number; b: number };
  /** Set for organizers: the chip that jumps back to the event console. */
  organizeHref?: string;
};

export function PlayClient({
  eventId,
  eventName,
  leagueSlug,
  tableNumber,
  matchId,
  mySide,
  players,
  startingLife,
  initialGame,
  initialWins,
  organizeHref,
}: Props) {
  const [aLife, setALife] = useState(initialGame.playerALife);
  const [bLife, setBLife] = useState(initialGame.playerBLife);
  const [wins, setWins] = useState(initialWins);
  // Life taps and the outcome buttons get separate transitions on purpose.
  // Sharing one meant every life tap flipped the outcome buttons' pending
  // flag, blinking them disabled on each tap. Life's pending is deliberately
  // unread — those taps are optimistic and never gate the UI.
  const [, startLifeTransition] = useTransition();
  const [outcomePending, startOutcomeTransition] = useTransition();
  // Count outstanding adjust requests per side. While >0, neither the SSE
  // listener nor the polling tick are allowed to overwrite local life — those
  // arrive with stale server snapshots and would visually rubber-band the
  // counter back. Cleared once every in-flight write resolves.
  const inFlight = useRef<{ a: number; b: number }>({ a: 0, b: 0 });
  // The game these life totals belong to. Seeded from SSR and kept current by
  // the polling reconcile below. The SSE listener ignores `life_changed` events
  // for any other game, so a reconnect history-replay of a *previous* game's
  // life totals (whose resetting `game_complete` is structural and gets dropped
  // from the replay) can't rewind the counter. See src/lib/life-events.ts.
  const currentGameId = useRef<string>(initialGame.id);
  // Publish-time ts of the last life event we applied, per side — rejects
  // out-of-order / duplicated replay deliveries within the current game.
  const lastTs = useRef<{ a: number; b: number }>({ a: 0, b: 0 });

  // Subscribe to live updates for the opponent's edits. SSE is fast but
  // best-effort — the polling loop below is the source of truth.
  useEffect(() => {
    const es = new EventSource(`/api/events/${eventId}/stream`);
    es.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data) as EventMessage;
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
        else if (players.b && msg.winnerId === players.b.id)
          setWins((w) => ({ ...w, b: w.b + 1 }));
        setALife(startingLife);
        setBLife(startingLife);
        inFlight.current = { a: 0, b: 0 };
        // A new game is starting. Drop the ts baselines and adopt the new game
        // id the event carries, so life events (and our own writes' CAS token)
        // target the new game immediately — no blind window waiting on the poll,
        // and events for the *old* game are rejected by the id mismatch.
        lastTs.current = { a: 0, b: 0 };
        currentGameId.current = msg.newGameId;
      }
      if (msg.type === "match_complete" && msg.matchId === matchId) {
        window.location.reload();
      }
      // When the organizer advances rounds, the page that decides which match
      // is "yours" lives on the server — reload to re-fetch.
      if (
        msg.type === "round_started" ||
        msg.type === "round_completed" ||
        msg.type === "event_state_changed"
      ) {
        window.location.reload();
      }
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, matchId, players.a.id, players.b?.id, startingLife]);

  // Belt-and-suspenders polling: every 3s, pull authoritative state from the
  // server and reconcile. Covers the case where SSE delivery silently fails
  // (cross-instance pubsub, dropped connection on the other phone, etc.).
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/events/${eventId}/match/${matchId}/state`,
          { cache: "no-store" }
        );
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
        // The server is the authority on which game is live; adopt it so the
        // SSE guard accepts events for the current game (and only that game).
        // On a poll-driven game flip (SSE game_complete missed), also drop the
        // ts baselines like the SSE branch does — otherwise the previous
        // game's lastTs could reject the new game's first live events.
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
        setWins((w) =>
          w.a === s.wins.a && w.b === s.wins.b ? w : s.wins
        );
      } catch {
        /* network blip — next tick retries */
      }
    };
    const id = setInterval(tick, 3000);
    // Kick once immediately so a freshly-loaded page reflects whatever happened
    // while we were away.
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [eventId, matchId]);

  useWakeLock();

  const myLife = mySide === "a" ? aLife : bLife;
  const oppLife = mySide === "a" ? bLife : aLife;
  const myPlayerId = mySide === "a" ? players.a.id : players.b?.id;
  const myName = mySide === "a" ? players.a.displayName : players.b?.displayName;
  const oppName = mySide === "a" ? players.b?.displayName : players.a.displayName;

  const adjust = (side: "a" | "b", delta: number) => {
    // Capture what the user saw *before* the optimistic update — that's the
    // value the server compares against. Rapid same-side taps each capture the
    // running optimistic value, so they chain correctly; a stale or duplicated
    // write fails the compare and the server hands back the truth to resync to.
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
    const winnerId =
      winnerSide === "me"
        ? mySide === "a"
          ? players.a.id
          : players.b!.id
        : mySide === "a"
          ? players.b!.id
          : players.a.id;
    startOutcomeTransition(async () => {
      await reportGameWinnerAction({
        matchId,
        winnerId,
        gameId: currentGameId.current,
      });
    });
  };

  const reportDraw = () => {
    if (!players.b) return;
    startOutcomeTransition(async () => {
      await reportMatchDrawAction({ matchId });
    });
  };

  const oppPlayer = mySide === "a" ? players.b : players.a;
  const myWins = mySide === "a" ? wins.a : wins.b;
  const oppWins = mySide === "a" ? wins.b : wins.a;
  const winLabel = (n: number) => `${n} win${n === 1 ? "" : "s"}`;

  return (
    <Scoreboard
      backHref={leagueSlug ? `/leagues/${leagueSlug}` : "/"}
      title={`Table ${tableNumber} · ${eventName}`}
      status={
        <span className="flex items-center gap-2">
          <GamePips wins={myWins} />
          <span className="h-3 w-px bg-line" aria-hidden />
          <GamePips wins={oppWins} />
        </span>
      }
      organizeHref={organizeHref}
      opponent={
        oppName && oppPlayer
          ? {
              name: oppName,
              detail: winLabel(oppWins),
              life: oppLife,
              avatars: avatarsFor(oppPlayer),
              onAdjust: (d) => adjust(oppSide, d),
            }
          : null
      }
      me={{
        name: myName ? `You · ${myName}` : "You",
        detail: winLabel(myWins),
        life: myLife,
        avatars: avatarsFor(mySide === "a" ? players.a : players.b),
        onAdjust: (d) => adjust(mySide, d),
      }}
      startingLife={startingLife}
      onIWon={() => reportWinner("me")}
      onTheyWon={() => reportWinner("opp")}
      outcomeDisabled={outcomePending}
      menu={[
        ...(players.b
          ? [
              {
                label: "Call the match a draw",
                confirm:
                  "Finalizes the match and ends the round for both of you.",
                tone: "danger" as const,
                onSelect: reportDraw,
              },
            ]
          : []),
        ...(myPlayerId
          ? [{ label: "Edit my portrait", href: `/players/${myPlayerId}` }]
          : []),
        {
          label: "Switch player",
          confirm: "Only if this phone is scoring for someone else.",
          href: `/events/${eventId}/claim?switch=1`,
        },
        ...(leagueSlug
          ? [{ label: "League", href: `/leagues/${leagueSlug}` }]
          : []),
      ]}
    />
  );
}
