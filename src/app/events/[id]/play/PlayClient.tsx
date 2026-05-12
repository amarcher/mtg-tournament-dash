"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  adjustLifeAction,
  reportGameWinnerAction,
} from "@/app/events/actions";
import type { Game, Player } from "@/db/schema";
import type { EventMessage } from "@/lib/pubsub";
import { pickAvatarUrl, type AvatarTiers } from "@/lib/avatar-tier";

type Props = {
  eventId: string;
  matchId: string;
  mySide: "a" | "b";
  players: { a: Player; b: Player | null };
  startingLife: number;
  initialGame: Game;
  initialWins: { a: number; b: number };
};

function avatarsFor(p: Player | null): AvatarTiers {
  return {
    fresh: p?.avatarUrl ?? null,
    wounded: p?.avatarWoundedUrl ?? null,
    critical: p?.avatarCriticalUrl ?? null,
    victory: p?.avatarVictoryUrl ?? null,
    defeat: p?.avatarDefeatUrl ?? null,
  };
}

export function PlayClient({
  eventId,
  matchId,
  mySide,
  players,
  startingLife,
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

  // Either player can edit either side's life. SSE fan-out gives us
  // last-write-wins automatically — every adjust hits the DB with the new
  // total, then publishes a `life_changed` event everyone else applies.
  const adjust = (side: "a" | "b", delta: number) => {
    if (side === "a") setALife((v) => v + delta);
    else setBLife((v) => v + delta);
    startTransition(async () => {
      await adjustLifeAction({ matchId, side, delta });
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
    startTransition(async () => {
      await reportGameWinnerAction({ matchId, winnerId });
    });
  };

  return (
    <main className="mx-auto flex max-w-md w-full flex-col gap-6 px-4 py-4">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-300"
      >
        ← Home
      </Link>
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

      <LifePanel
        label={`${myName ?? "You"} (you)`}
        life={myLife}
        startingLife={startingLife}
        avatars={avatarsFor(mySide === "a" ? players.a : players.b)}
        onAdjust={(d) => adjust(mySide, d)}
        pending={pending}
        emphasized
      />

      {oppName && (
        <LifePanel
          label={oppName}
          life={oppLife}
          startingLife={startingLife}
          avatars={avatarsFor(mySide === "a" ? players.b : players.a)}
          onAdjust={(d) => adjust(oppSide, d)}
          pending={pending}
        />
      )}

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

function LifePanel({
  label,
  life,
  startingLife,
  avatars,
  onAdjust,
  pending,
  emphasized,
}: {
  label: string;
  life: number;
  startingLife: number;
  avatars: AvatarTiers;
  onAdjust: (delta: number) => void;
  pending: boolean;
  emphasized?: boolean;
}) {
  // Same tier-aware portrait that the broadcast view uses, so the wizard on
  // your phone looks the same as on the TV and visibly takes damage as life
  // drops.
  const bgUrl = pickAvatarUrl(life, startingLife, avatars);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 text-center ${
        emphasized
          ? "border-amber-500/40 bg-zinc-900"
          : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      {bgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgUrl}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90"
        />
      )}
      {/* Readability scrim: clear at the top so the face is visible, dark at
          the bottom where the buttons sit. */}
      {bgUrl && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-black/55 to-black/90" />
      )}

      <div className="relative z-10">
        <div
          className="text-xs uppercase tracking-wide text-zinc-300"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
        >
          {label}
        </div>
        <div
          className={`my-1 font-bold tabular-nums ${
            emphasized ? "text-7xl text-white" : "text-5xl text-zinc-100"
          }`}
          style={{
            textShadow:
              "0 4px 18px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,1)",
          }}
        >
          {life}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <LifeButton onClick={() => onAdjust(-5)} disabled={pending}>
            −5
          </LifeButton>
          <LifeButton onClick={() => onAdjust(-1)} disabled={pending}>
            −1
          </LifeButton>
          <LifeButton onClick={() => onAdjust(+1)} disabled={pending}>
            +1
          </LifeButton>
          <LifeButton onClick={() => onAdjust(+5)} disabled={pending}>
            +5
          </LifeButton>
        </div>
      </div>
    </div>
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
  // Best-of-3 → first to 2 wins, so two pips.
  return (
    <span className="flex gap-1">
      {[0, 1].map((i) => (
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
