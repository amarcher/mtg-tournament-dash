"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  adjustLifeAction,
  reportGameWinnerAction,
} from "@/app/events/actions";
import type { Game, Player } from "@/db/schema";
import type { EventMessage } from "@/lib/pubsub";

type Props = {
  eventId: string;
  matchId: string;
  mySide: "a" | "b";
  players: { a: Player; b: Player | null };
  initialGame: Game;
  initialWins: { a: number; b: number };
};

export function PlayClient({
  eventId,
  matchId,
  mySide,
  players,
  initialGame,
  initialWins,
}: Props) {
  const [aLife, setALife] = useState(initialGame.playerALife);
  const [bLife, setBLife] = useState(initialGame.playerBLife);
  const [wins, setWins] = useState(initialWins);
  const [pending, startTransition] = useTransition();

  // Subscribe to live updates so the opponent's life and game wins refresh.
  useEffect(() => {
    const es = new EventSource(`/api/events/${eventId}/stream`);
    es.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data) as EventMessage;
      if (msg.type === "life_changed" && msg.matchId === matchId) {
        if (msg.side === "a") setALife(msg.life);
        else setBLife(msg.life);
      }
      if (msg.type === "game_complete" && msg.matchId === matchId) {
        // Optimistic refresh — server will revalidate too.
        if (msg.winnerId === players.a.id)
          setWins((w) => ({ ...w, a: w.a + 1 }));
        else if (players.b && msg.winnerId === players.b.id)
          setWins((w) => ({ ...w, b: w.b + 1 }));
        // Reset life for the next game.
        setALife(initialGame.playerALife);
        setBLife(initialGame.playerALife);
      }
      if (msg.type === "match_complete" && msg.matchId === matchId) {
        // Hard refresh to render the "match over" state.
        window.location.reload();
      }
    });
    return () => es.close();
    // players.b is intentionally referenced via .id only; including the whole
    // object would re-subscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, matchId, players.a.id, players.b?.id, initialGame.playerALife]);

  const myLife = mySide === "a" ? aLife : bLife;
  const oppLife = mySide === "a" ? bLife : aLife;
  const myPlayerId = mySide === "a" ? players.a.id : players.b?.id;
  const myName = mySide === "a" ? players.a.displayName : players.b?.displayName;
  const oppName = mySide === "a" ? players.b?.displayName : players.a.displayName;

  const adjust = (delta: number) => {
    // Optimistic.
    if (mySide === "a") setALife((v) => v + delta);
    else setBLife((v) => v + delta);
    startTransition(async () => {
      await adjustLifeAction({ matchId, side: mySide, delta });
    });
  };

  const reportWinner = (winnerSide: "me" | "opp") => {
    const winnerId =
      winnerSide === "me"
        ? mySide === "a"
          ? players.a.id
          : players.b!.id
        : mySide === "a"
          ? players.b!.id
          : players.a.id;
    startTransition(async () => {
      await reportGameWinnerAction({ matchId, winnerId });
    });
  };

  return (
    <main className="mx-auto flex max-w-md w-full flex-col gap-6 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            You
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-semibold">{myName}</div>
            {myPlayerId && (
              <Link
                href={`/players/${myPlayerId}`}
                className="text-xs text-amber-400/80 hover:text-amber-300"
              >
                🔮 Swap portrait
              </Link>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            vs
          </div>
          <div className="text-lg font-semibold">{oppName ?? "BYE"}</div>
        </div>
      </header>

      <div className="flex items-center justify-center gap-3 text-sm">
        <GamePips wins={mySide === "a" ? wins.a : wins.b} />
        <span className="text-zinc-500">games</span>
        <GamePips wins={mySide === "a" ? wins.b : wins.a} />
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Your life
        </div>
        <div className="my-2 text-7xl font-bold tabular-nums">{myLife}</div>
        <div className="grid grid-cols-4 gap-2">
          <LifeButton onClick={() => adjust(-5)} disabled={pending}>
            −5
          </LifeButton>
          <LifeButton onClick={() => adjust(-1)} disabled={pending}>
            −1
          </LifeButton>
          <LifeButton onClick={() => adjust(+1)} disabled={pending}>
            +1
          </LifeButton>
          <LifeButton onClick={() => adjust(+5)} disabled={pending}>
            +5
          </LifeButton>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Opponent life
        </div>
        <div className="text-4xl font-semibold tabular-nums text-zinc-300">
          {oppLife}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => reportWinner("me")}
          disabled={pending}
          className="rounded-xl bg-emerald-500 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          I won this game
        </button>
        <button
          onClick={() => reportWinner("opp")}
          disabled={pending}
          className="rounded-xl bg-zinc-700 py-3 font-semibold hover:bg-zinc-600 disabled:opacity-50"
        >
          They won
        </button>
      </div>
    </main>
  );
}

function LifeButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-zinc-800 py-3 text-lg font-semibold tabular-nums hover:bg-zinc-700 active:scale-95 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GamePips({ wins }: { wins: number }) {
  return (
    <span className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={
            i < wins
              ? "h-3 w-3 rounded-full bg-amber-500"
              : "h-3 w-3 rounded-full border border-zinc-700"
          }
        />
      ))}
    </span>
  );
}
