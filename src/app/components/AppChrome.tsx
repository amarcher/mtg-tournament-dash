import Link from "next/link";
import type { League, Player } from "@/db/schema";
import { AccountMenu } from "@/app/components/AccountMenu";

export type AppTab = "play" | "schedule" | "league" | "organize";

type AppChromeProps = {
  league?: Pick<League, "id" | "name" | "slug"> | null;
  player?: Pick<Player, "id" | "displayName" | "avatarUrl"> | null;
  /** Can this viewer organize the league at all? Drives the account menu's
   * organizer-mode switch. Actions are the real authz boundary — this is
   * progressive disclosure, not security. */
  isOrganizer?: boolean;
  /** Organizer with organizer mode switched on: adds the Organize tab. */
  organizerMode?: boolean;
  active?: AppTab;
  children: React.ReactNode;
};

/**
 * Slim top bar (league name + account menu) and, inside a league, the bottom
 * tab bar: Play · Schedule · League for everyone, plus Organize in organizer
 * mode. The scorekeeper and broadcast views don't use this — they're
 * full-screen on purpose.
 */
export function AppChrome({
  league,
  player,
  isOrganizer = false,
  organizerMode = false,
  active,
  children,
}: AppChromeProps) {
  const leagueHref = league ? `/leagues/${league.slug}` : "/";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
          <Link
            href={leagueHref}
            className="min-w-0 truncate rounded-md py-2 font-display text-base font-bold tracking-tight text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            {league?.name ?? "MTG Dash"}
          </Link>
          {organizerMode && (
            <span className="label-caps hidden shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1.5 text-gold sm:inline">
              Organizer
            </span>
          )}
          <div className="ml-auto shrink-0">
            <AccountMenu
              league={league ? { id: league.id, slug: league.slug, name: league.name } : null}
              player={player ?? null}
              isOrganizer={isOrganizer}
              organizerMode={organizerMode}
            />
          </div>
        </div>
      </header>

      {children}

      {league && (
        <>
          {/* Keeps the last row of content clear of the fixed tab bar. */}
          <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom))] shrink-0" />
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[rgb(14_11_7/0.94)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
          >
            <div
              className={`mx-auto grid max-w-md ${organizerMode ? "grid-cols-4" : "grid-cols-3"}`}
            >
              <Tab href={leagueHref} label="Play" on={active === "play"} icon={<StarIcon />} />
              <Tab
                href={`${leagueHref}/schedule`}
                label="Schedule"
                on={active === "schedule"}
                icon={<CalendarIcon />}
              />
              <Tab
                href={`${leagueHref}/standings`}
                label="League"
                on={active === "league"}
                icon={<TrophyIcon />}
              />
              {organizerMode && (
                <Tab
                  href={`${leagueHref}/organize`}
                  label="Organize"
                  on={active === "organize"}
                  icon={<SlidersIcon />}
                />
              )}
            </div>
          </nav>
        </>
      )}
    </>
  );
}

function Tab({
  href,
  label,
  on,
  icon,
}: {
  href: string;
  label: string;
  on: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/70 ${
        on ? "text-gold" : "text-ink-faint hover:text-ink-dim"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  width: 22,
  height: 22,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function StarIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z" />
      <path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "complete" || status === "finalized"
      ? "bg-emerald-500/12 text-emerald-300"
      : status === "active" || status === "open"
        ? "bg-amber-500/15 text-gold"
        : "bg-white/6 text-ink-dim";
  return (
    <span className={`label-caps rounded-full px-2.5 py-1.5 ${tone}`}>
      {status}
    </span>
  );
}
