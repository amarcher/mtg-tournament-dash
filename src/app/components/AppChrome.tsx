import Link from "next/link";
import type { Event, League, Player } from "@/db/schema";

type AppChromeProps = {
  league?: Pick<League, "name" | "slug"> | null;
  player?: Pick<Player, "id" | "displayName" | "avatarUrl"> | null;
  currentEvent?: Pick<Event, "id" | "name" | "status"> | null;
  /** Hides organizer-only nav (New Event, Settings). Actions are the real
   * authz boundary — this is progressive disclosure, not security. */
  isOrganizer?: boolean;
  active?:
    | "league"
    | "players"
    | "events"
    | "play"
    | "manage"
    | "schedule"
    | "settings"
    | "me";
  children: React.ReactNode;
};

const linkBase =
  "rounded-md px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70";
const linkActive = "bg-zinc-800 text-zinc-50";

export function AppChrome({
  league,
  player,
  currentEvent,
  isOrganizer = false,
  active,
  children,
}: AppChromeProps) {
  const leagueHref = league ? `/leagues/${league.slug}` : "/";
  const eventHref = currentEvent ? `/events/${currentEvent.id}/manage` : null;
  const playHref = currentEvent ? `/events/${currentEvent.id}/play` : null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-900/90 bg-zinc-950/90 backdrop-blur">
        <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="mr-2 rounded-md py-2 text-sm font-semibold tracking-tight text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            MTG Dash
          </Link>
          <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:flex-1">
            <Link
              href={leagueHref}
              className={`${linkBase} ${active === "league" ? linkActive : ""}`}
            >
              League
            </Link>
            {league && (
              <>
                <Link
                  href={`${leagueHref}/claim`}
                  className={`${linkBase} ${active === "players" ? linkActive : ""}`}
                >
                  Players
                </Link>
                {isOrganizer && (
                  <Link
                    href={`${leagueHref}/events/new`}
                    className={`${linkBase} ${active === "events" ? linkActive : ""}`}
                  >
                    New Event
                  </Link>
                )}
                <Link
                  href={`${leagueHref}/schedule`}
                  className={`${linkBase} ${active === "schedule" ? linkActive : ""}`}
                >
                  Schedule
                </Link>
                {isOrganizer && (
                  <Link
                    href={`${leagueHref}/settings`}
                    className={`${linkBase} ${active === "settings" ? linkActive : ""}`}
                  >
                    Settings
                  </Link>
                )}
              </>
            )}
            {eventHref && (
              <Link
                href={eventHref}
                className={`${linkBase} ${active === "manage" ? linkActive : ""}`}
              >
                Manage
              </Link>
            )}
            {playHref && (
              <Link
                href={playHref}
                className={`${linkBase} ${active === "play" ? linkActive : ""}`}
              >
                Scorekeeper
              </Link>
            )}
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {currentEvent ? (
              <div className="min-w-0 max-w-[8rem] truncate text-right text-xs text-zinc-600 sm:max-w-none">
                {currentEvent.name}
              </div>
            ) : null}
            {player ? (
              <Link
                href={`/players/${player.id}`}
                aria-label={`Your wizard, ${player.displayName} — edit portrait`}
                className={`flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-zinc-800 active:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
                  active === "me" ? "bg-zinc-800" : ""
                }`}
              >
                {player.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={player.avatarUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-amber-500/50"
                  />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-amber-500/60 font-mono text-xs text-amber-400/80">
                    {player.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 text-left text-xs leading-tight">
                  <span className="block truncate text-emerald-300">
                    {player.displayName}
                  </span>
                  <span className="block truncate text-zinc-500">
                    Your wizard
                  </span>
                </span>
              </Link>
            ) : league ? (
              <div className="min-w-0 truncate text-right text-xs text-zinc-500">
                {league.name}
              </div>
            ) : null}
          </div>
        </nav>
      </header>
      {children}
    </>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "complete" || status === "finalized"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : status === "active" || status === "open"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : "border-zinc-700 bg-zinc-900 text-zinc-400";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}
