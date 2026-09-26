"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { setOrganizerModeAction } from "@/app/events/actions";
import { Sheet, sheetRowClass } from "@/app/components/Sheet";

type MenuPlayer = { id: string; displayName: string; avatarUrl: string | null };

/**
 * The avatar in the top bar. Everything about *who you are* lives here —
 * your wizard, switching wizards, and (for organizers) the organizer-mode
 * switch — so the tab bar can stay the same four-or-fewer places for everyone.
 */
export function AccountMenu({
  league,
  player,
  isOrganizer,
  organizerMode,
}: {
  league: { id: string; slug: string; name: string } | null;
  player: MenuPlayer | null;
  isOrganizer: boolean;
  organizerMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={player ? `${player.displayName} — account` : "Account"}
        aria-haspopup="dialog"
        className="flex min-h-11 items-center gap-2 rounded-full py-1 pr-1 pl-3 btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
      >
        <span className="max-w-[7rem] truncate text-sm font-semibold">
          {player ? player.displayName : league ? "Claim wizard" : "Menu"}
        </span>
        <Avatar player={player} ring={organizerMode} />
      </button>

      {open && (
        <Sheet label="Account" onClose={() => setOpen(false)}>
          {player && (
            <Link
              href={`/players/${player.id}`}
              onClick={() => setOpen(false)}
              className={`${sheetRowClass} py-2`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <Avatar player={player} size="lg" />
                <span className="min-w-0">
                  <span className="block truncate">{player.displayName}</span>
                  <span className="block text-xs font-normal text-ink-dim">
                    Your wizard · edit portrait
                  </span>
                </span>
              </span>
              <Chevron />
            </Link>
          )}
          {league && (
            <Link
              href={`/leagues/${league.slug}/claim`}
              onClick={() => setOpen(false)}
              className={sheetRowClass}
            >
              {player ? "Switch wizard" : "Claim your wizard"}
              <Chevron />
            </Link>
          )}

          {league && isOrganizer && (
            <form action={setOrganizerModeAction}>
              <input type="hidden" name="leagueId" value={league.id} />
              <input type="hidden" name="on" value={organizerMode ? "0" : "1"} />
              <input type="hidden" name="next" value={pathname} />
              <button
                type="submit"
                role="switch"
                aria-checked={organizerMode}
                className={`${sheetRowClass} ${organizerMode ? "bg-amber-500/10" : ""}`}
              >
                <span>
                  Organizer mode
                  <span className="block text-xs font-normal text-ink-dim">
                    {organizerMode
                      ? "Showing rounds, pairings and planning tools"
                      : "Off — you see what players see"}
                  </span>
                </span>
                <Toggle on={organizerMode} />
              </button>
            </form>
          )}
          {league && organizerMode && (
            <>
              <Link
                href={`/leagues/${league.slug}/events/new`}
                onClick={() => setOpen(false)}
                className={sheetRowClass}
              >
                New event
                <Chevron />
              </Link>
              <Link
                href={`/leagues/${league.slug}/settings`}
                onClick={() => setOpen(false)}
                className={sheetRowClass}
              >
                League settings
                <Chevron />
              </Link>
            </>
          )}

          <div className="my-1 h-px bg-line" />
          <Link href="/" onClick={() => setOpen(false)} className={`${sheetRowClass} text-ink-dim`}>
            All leagues
            <Chevron />
          </Link>
          {league && !isOrganizer && (
            <Link
              href={`/sign-in?next=/leagues/${league.slug}`}
              onClick={() => setOpen(false)}
              className={`${sheetRowClass} text-ink-dim`}
            >
              Organizer sign-in
              <Chevron />
            </Link>
          )}
        </Sheet>
      )}
    </>
  );
}

function Avatar({
  player,
  ring,
  size = "sm",
}: {
  player: MenuPlayer | null;
  ring?: boolean;
  size?: "sm" | "lg";
}) {
  const dims = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const ringClass = ring ? "ring-2 ring-gold" : "ring-1 ring-line-strong";
  if (player?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={player.avatarUrl}
        alt=""
        className={`${dims} shrink-0 rounded-full object-cover ${ringClass}`}
      />
    );
  }
  return (
    <span
      className={`${dims} grid shrink-0 place-items-center rounded-full bg-surface-2 font-display text-xs font-bold text-gold ${ringClass}`}
    >
      {player ? player.displayName.charAt(0).toUpperCase() : "?"}
    </span>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        on ? "bg-amber-500" : "bg-white/10"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-ink transition-[left] duration-200 ease-[var(--ease-spring)] ${
          on ? "left-[23px]" : "left-[3px]"
        }`}
      />
    </span>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-faint" aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
