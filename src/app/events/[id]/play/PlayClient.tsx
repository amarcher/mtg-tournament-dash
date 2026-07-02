"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  adjustLifeAction,
  reportGameWinnerAction,
  reportMatchDrawAction,
} from "@/app/events/actions";
import type { Game, Player } from "@/db/schema";
import type { EventMessage } from "@/lib/pubsub";
import { pickAvatarUrl, type AvatarTiers } from "@/lib/avatar-tier";
import { shouldApplyLifeChanged } from "@/lib/life-events";

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
  eventName,
  leagueSlug,
  tableNumber,
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

  // Keep the phone awake during the match. Releases on unmount and re-acquires
  // when the page returns to the foreground (the OS auto-releases when the tab
  // is hidden). Silently no-ops on browsers without the API.
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

  const reportDraw = () => {
    if (!players.b) return;
    if (
      !window.confirm(
        "Call this match a draw? This finalizes it and ends the round for both of you."
      )
    ) {
      return;
    }
    startTransition(async () => {
      await reportMatchDrawAction({ matchId });
    });
  };

  return (
    <main className="mx-auto flex max-w-md w-full flex-col gap-6 px-4 py-4 landscape:h-dvh landscape:max-w-4xl landscape:gap-2 landscape:overflow-hidden landscape:py-2">
      <nav className="flex flex-wrap gap-2 text-sm landscape:hidden">
        {leagueSlug && (
          <Link
            href={`/leagues/${leagueSlug}`}
            className="rounded-md px-2 py-1 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            League
          </Link>
        )}
        <Link
          href={`/events/${eventId}/claim?switch=1`}
          className="rounded-md px-2 py-1 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          Switch player
        </Link>
      </nav>
      <div className="hidden items-center justify-between gap-3 text-xs text-zinc-400 landscape:flex">
        <span className="min-w-0 truncate">
          <span className="font-semibold text-zinc-200">{eventName}</span>
          <span className="text-zinc-500"> · Table {tableNumber}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <GamePips wins={mySide === "a" ? wins.b : wins.a} />
          <span className="text-zinc-500">games</span>
          <GamePips wins={mySide === "a" ? wins.a : wins.b} />
        </span>
      </div>
      <header className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 landscape:hidden">
        <div className="mb-3 min-w-0">
          <div className="truncate text-lg font-semibold">{eventName}</div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Table {tableNumber} · scorekeeper
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              You
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-lg font-semibold">{myName}</div>
              {myPlayerId && (
                <Link
                  href={`/players/${myPlayerId}`}
                  className="text-xs text-amber-400/80 transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                >
                  Edit portrait
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
        </div>
      </header>

      <div className="flex items-center justify-center gap-3 text-sm landscape:hidden">
        <GamePips wins={mySide === "a" ? wins.a : wins.b} />
        <span className="text-zinc-500">games</span>
        <GamePips wins={mySide === "a" ? wins.b : wins.a} />
      </div>

      {/* Portrait stacks opponent above you — your counter sits nearest you
          with the phone on the table. Landscape puts you side-by-side,
          opponent left, you right. */}
      <div className="flex min-h-0 flex-col gap-6 landscape:flex-1 landscape:flex-row landscape:gap-3">
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

        <LifePanel
          label={`${myName ?? "You"} (you)`}
          life={myLife}
          startingLife={startingLife}
          avatars={avatarsFor(mySide === "a" ? players.a : players.b)}
          onAdjust={(d) => adjust(mySide, d)}
          pending={pending}
          emphasized
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => reportWinner("opp")}
          disabled={pending || !oppName}
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

      {players.b && (
        <button
          onClick={reportDraw}
          disabled={pending}
          className="rounded-xl border border-zinc-700 bg-zinc-950 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-50 landscape:py-1.5 landscape:text-xs"
        >
          Call this match a draw
        </button>
      )}
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
  const bgUrl = pickAvatarUrl(life, startingLife, avatars);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 text-center landscape:flex landscape:min-w-0 landscape:flex-1 landscape:flex-col landscape:justify-center ${
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
      className="rounded-lg bg-zinc-800 py-3 text-lg font-semibold tabular-nums transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 active:scale-95 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GamePips({ wins }: { wins: number }) {
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
