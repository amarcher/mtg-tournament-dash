"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Sheet, sheetRowClass } from "@/app/components/Sheet";
import { LifePanel } from "@/app/components/LifePanel";
import type { AvatarTiers } from "@/lib/avatar-tier";

export type ScoreboardSide = {
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
  menu: ScoreboardMenuItem[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
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
          onClick={onTheyWon}
          disabled={outcomeDisabled || !opponent}
          className={`h-14 touch-manipulation select-none rounded-[14px] btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
            opponent ? "" : "opacity-40"
          }`}
        >
          They won
        </button>
        <button
          onClick={onIWon}
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

      {menuOpen && (
        <MenuSheet
          items={menu}
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
