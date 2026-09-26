"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Sheet, sheetRowClass } from "@/app/components/Sheet";
import { LifePanel } from "@/app/components/LifePanel";
import type { AvatarTiers } from "@/lib/avatar-tier";
import type { LifeHistory, LifeSide } from "@/lib/life-history";

export type ScoreboardSide = {
  /** Which stored side (a/b) this panel shows — used to label history. */
  side: LifeSide;
  name: string;
  detail?: string;
  life: number;
  avatars: AvatarTiers;
  onAdjust: (delta: number) => void;
};

export type ScoreboardMenuItem = {
  label: string;
  href?: string;
  onSelect?: () => void;
  /** When set, the first tap arms the item and shows this text; the second
   * tap commits. Replaces window.confirm, which the sheet already covers. */
  confirm?: string;
  tone?: "danger";
};

const FLIP_KEY = "mtg:flip-opponent";
const flipListeners = new Set<() => void>();

function readFlip(): boolean {
  try {
    return localStorage.getItem(FLIP_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFlip(on: boolean) {
  try {
    if (on) localStorage.setItem(FLIP_KEY, "1");
    else localStorage.removeItem(FLIP_KEY);
  } catch {
    /* private mode — the toggle just won't persist */
  }
  flipListeners.forEach((l) => l());
}

function subscribeFlip(listener: () => void) {
  flipListeners.add(listener);
  return () => flipListeners.delete(listener);
}

/**
 * Full-screen scorekeeper shell shared by tournament matches and bonus games.
 * Pinned to the visible viewport (fixed inset-0 + safe areas), so the only
 * things on screen are a slim top bar, the two life panels, and one action
 * row — no page scroll in Safari with or without its toolbar. Everything
 * secondary (draw, switch player, portrait, flip) lives in the ⋯ sheet.
 */
export function Scoreboard({
  backHref,
  title,
  status,
  banner,
  organizeHref,
  opponent,
  me,
  startingLife,
  onIWon,
  onTheyWon,
  outcomeDisabled,
  confirmIWon,
  confirmTheyWon,
  getHistory,
  menu,
}: {
  backHref: string;
  title: string;
  /** Sits under the title — game pips or a running tally. */
  status?: React.ReactNode;
  banner?: React.ReactNode;
  /** Organizer shortcut back to the event console. */
  organizeHref?: string;
  /** Null on a bye. */
  opponent: ScoreboardSide | null;
  me: ScoreboardSide;
  startingLife: number;
  onIWon: () => void;
  onTheyWon: () => void;
  outcomeDisabled?: boolean;
  /** When set, "I won" asks for confirmation first with this message —
   * used when the tap would decide a tournament match. */
  confirmIWon?: string | null;
  confirmTheyWon?: string | null;
  /** Life changes this phone has seen during the current game. */
  getHistory?: () => LifeHistory;
  menu: ScoreboardMenuItem[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyAt, setHistoryAt] = useState<{
    at: number;
    history: LifeHistory;
  } | null>(null);
  const [confirming, setConfirming] = useState<"me" | "opp" | null>(null);
  const openHistory = getHistory
    ? () => setHistoryAt({ at: Date.now(), history: getHistory() })
    : undefined;
  const names: Record<LifeSide, string> = {
    [me.side]: "You",
    ...(opponent ? { [opponent.side]: opponent.name } : {}),
  } as Record<LifeSide, string>;
  const flipped = useSyncExternalStore(subscribeFlip, readFlip, () => false);

  return (
    <main className="fixed inset-0 flex flex-col bg-canvas pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      <header className="flex h-14 shrink-0 items-center gap-2 px-2">
        <Link
          href={backHref}
          aria-label="Back"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          <ChevronLeft />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="label-caps max-w-full truncate text-ink-dim">
            {title}
          </span>
          {status}
        </div>
        {organizeHref ? (
          <Link
            href={organizeHref}
            className="label-caps shrink-0 rounded-full px-3 py-3 btn-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Organize
          </Link>
        ) : (
          <span className="w-11 shrink-0" aria-hidden />
        )}
      </header>

      {banner && <div className="shrink-0 px-2 pb-2">{banner}</div>}

      {/* Portrait stacks opponent above you — your counter sits nearest you
          with the phone on the table. Landscape puts you side by side. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 landscape:flex-row">
        {opponent ? (
          <LifePanel
            {...opponent}
            startingLife={startingLife}
            flipped={flipped}
            onNumberTap={openHistory}
            className="flex-[4] landscape:flex-1"
          />
        ) : (
          <div className="grid flex-[2] place-items-center rounded-[22px] border border-dashed border-line text-center landscape:flex-1">
            <div>
              <div className="label-caps text-gold">Bye</div>
              <p className="mt-2 text-sm text-ink-dim">
                No opponent this round. You get the win.
              </p>
            </div>
          </div>
        )}
        <LifePanel
          {...me}
          startingLife={startingLife}
          onNumberTap={openHistory}
          emphasized
          className="flex-[5] landscape:flex-1"
        />
      </div>

      {/* Outcome buttons stay disabled while their own action commits —
          reporting a winner twice would finalize twice — but carry no
          disabled styling: the commit is short and a dimmed flash reads as a
          glitch. The one persistent dim is a bye (no one to lose to). */}
      <div className="grid shrink-0 grid-cols-[1fr_1.35fr_auto] gap-2 px-2 pt-2 pb-3">
        <button
          onClick={confirmTheyWon ? () => setConfirming("opp") : onTheyWon}
          disabled={outcomeDisabled || !opponent}
          className={`h-14 touch-manipulation select-none rounded-[14px] btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
            opponent ? "" : "opacity-40"
          }`}
        >
          They won
        </button>
        <button
          onClick={confirmIWon ? () => setConfirming("me") : onIWon}
          disabled={outcomeDisabled}
          className="h-14 touch-manipulation select-none rounded-[14px] btn-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          I won
        </button>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="More options"
          aria-haspopup="dialog"
          className="grid h-14 w-14 touch-manipulation place-items-center rounded-[14px] btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          <DotsIcon />
        </button>
      </div>

      {confirming && (
        <Sheet label="Confirm match result" onClose={() => setConfirming(null)}>
          <div className="px-3 pt-3 pb-2">
            <div className="label-caps text-gold">This decides the match</div>
            <p className="mt-2 text-base leading-snug">
              {confirming === "me" ? confirmIWon : confirmTheyWon}
            </p>
            <p className="mt-2 text-sm text-ink-dim">
              The result and ELO are recorded right away. Only the organizer
              can undo it after that.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-1">
            <button
              onClick={() => setConfirming(null)}
              className={`${sheetRowClass} justify-center border border-line`}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const who = confirming;
                setConfirming(null);
                if (who === "me") onIWon();
                else onTheyWon();
              }}
              className="flex min-h-14 items-center justify-center rounded-[14px] text-base btn-gold"
            >
              Record it
            </button>
          </div>
        </Sheet>
      )}

      {historyAt && (
        <HistorySheet
          history={historyAt.history}
          now={historyAt.at}
          names={names}
          onClose={() => setHistoryAt(null)}
        />
      )}

      {menuOpen && (
        <MenuSheet
          items={[
            ...(openHistory
              ? [{ label: "Life history", onSelect: openHistory }]
              : []),
            ...menu,
          ]}
          flipped={flipped}
          canFlip={!!opponent}
          onFlip={() => writeFlip(!flipped)}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </main>
  );
}

function MenuSheet({
  items,
  flipped,
  canFlip,
  onFlip,
  onClose,
}: {
  items: ScoreboardMenuItem[];
  flipped: boolean;
  canFlip: boolean;
  onFlip: () => void;
  onClose: () => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);

  return (
    <Sheet label="Game options" onClose={onClose}>
      {canFlip && (
        <button onClick={onFlip} className={sheetRowClass} role="switch" aria-checked={flipped}>
          <span>
            Flip opponent&apos;s side
            <span className="block text-xs font-normal text-ink-dim">
              For one phone lying between you
            </span>
          </span>
          <span
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              flipped ? "bg-amber-500" : "bg-white/10"
            }`}
          >
            <span
              className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-ink transition-[left] duration-200 ease-[var(--ease-spring)] ${
                flipped ? "left-[23px]" : "left-[3px]"
              }`}
            />
          </span>
        </button>
      )}
      {items.map((item) => {
        const isArmed = armed === item.label;
        const tone =
          item.tone === "danger" ? "text-rose-300" : "text-ink";
        if (item.href && !item.confirm) {
          return (
            <Link key={item.label} href={item.href} className={`${sheetRowClass} ${tone}`}>
              {item.label}
              <ChevronRight />
            </Link>
          );
        }
        return (
          <button
            key={item.label}
            onClick={() => {
              if (item.confirm && !isArmed) {
                setArmed(item.label);
                return;
              }
              onClose();
              if (item.href) window.location.href = item.href;
              else item.onSelect?.();
            }}
            className={`${sheetRowClass} ${tone} ${
              isArmed ? "bg-rose-500/10 ring-1 ring-rose-400/40" : ""
            }`}
          >
            <span>
              {item.label}
              {isArmed && (
                <span className="block text-xs font-normal text-rose-200">
                  {item.confirm}
                </span>
              )}
            </span>
            {isArmed && (
              <span className="label-caps shrink-0 text-rose-200">
                Tap to confirm
              </span>
            )}
          </button>
        );
      })}
      <button
        onClick={onClose}
        className={`${sheetRowClass} mt-1 justify-center border border-line text-ink-dim`}
      >
        Close
      </button>
    </Sheet>
  );
}

function HistorySheet({
  history,
  now,
  names,
  onClose,
}: {
  history: LifeHistory;
  now: number;
  names: Record<LifeSide, string>;
  onClose: () => void;
}) {
  const entries = [...history.entries].reverse();
  return (
    <Sheet label="Life history" onClose={onClose}>
      <div className="px-3 pt-3 pb-1">
        <div className="label-caps text-ink-dim">Life history · this game</div>
      </div>
      {entries.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-ink-dim">
          No life changes yet this game.
        </p>
      ) : (
        <ol className="max-h-[55svh] overflow-y-auto overscroll-contain px-1">
          {entries.map((e, i) => {
            const delta = e.to - e.from;
            return (
              <li
                key={`${e.at}-${i}`}
                className="flex items-center gap-3 border-b border-white/5 px-2 py-2.5 last:border-b-0"
              >
                <span className="label-caps w-20 shrink-0 truncate text-ink-dim">
                  {names[e.side] ?? e.side}
                </span>
                <span className="flex-1 font-display text-lg font-bold tabular-nums">
                  {e.from}
                  <span className="px-1.5 text-ink-faint">→</span>
                  {e.to}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold tabular-nums ${
                    delta < 0
                      ? "bg-rose-500/15 text-rose-200"
                      : "bg-emerald-500/15 text-emerald-200"
                  }`}
                >
                  {delta > 0 ? `+${delta}` : `−${-delta}`}
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-ink-faint tabular-nums">
                  {ago(now - e.lastAt)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="px-3 pt-2 pb-1 text-xs text-ink-faint">
        Kept on this phone for the current game only. Tap a life total to
        open this any time.
      </p>
      <button
        onClick={onClose}
        className={`${sheetRowClass} mt-1 justify-center border border-line text-ink-dim`}
      >
        Close
      </button>
    </Sheet>
  );
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** Two dots per player — best of three. */
export function GamePips({ wins }: { wins: number }) {
  return (
    <span className="flex gap-1" aria-label={`${wins} game${wins === 1 ? "" : "s"} won`}>
      {[0, 1].map((i) => (
        <span
          key={i}
          className={
            i < wins
              ? "h-2 w-2 rounded-full bg-gold shadow-[0_0_6px_rgb(255_215_106/0.7)]"
              : "h-2 w-2 rounded-full border border-ink-faint"
          }
        />
      ))}
    </span>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint" aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
