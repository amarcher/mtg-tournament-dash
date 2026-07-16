import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent, getEventRoster, getLeague } from "@/db/queries";
import { getCurrentLeaguePlayer, getCurrentPlayer } from "@/lib/auth";
import { claimIdentityAction, joinEventAction } from "@/app/events/actions";
import { AppChrome } from "@/app/components/AppChrome";
import { EventNav } from "@/app/components/EventNav";
import { isLeagueOrganizer } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ switch?: string; badlink?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();

  const [league, roster, me, leagueMe, organizer] = await Promise.all([
    getLeague(event.leagueId),
    getEventRoster(id),
    getCurrentPlayer(id),
    getCurrentLeaguePlayer(event.leagueId),
    isLeagueOrganizer(event.leagueId),
  ]);

  // "Switch player" toggle: when the user lands here already claimed, we show
  // the banner. Tapping "Switch player" re-renders without the banner so the
  // grid is the only thing competing for the eye.
  const switchMode = sp.switch === "1";
  const showBanner = me && !switchMode;

  const onRoster = leagueMe
    ? roster.find((r) => r.playerId === leagueMe.id)
    : null;

  return (
    <AppChrome
      league={league}
      player={leagueMe}
      currentEvent={event}
      isOrganizer={organizer}
      active="players"
    >
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <EventNav event={event} league={league} isOrganizer={organizer} active="claim" />
      <div className="mb-6">
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {event.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tap your wizard to claim your seat.
        </p>
      </div>

      {sp.badlink === "1" && !me && (
        <div className="mb-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          That join link didn&apos;t work — it may be old or mistyped. No
          problem: claim your seat below instead.
        </div>
      )}

      {!me && leagueMe && onRoster && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="text-amber-200">
            We recognize you as <strong>{leagueMe.displayName}</strong> from{" "}
            {league?.name ?? "this league"}.
          </span>
          <form action={claimIdentityAction} className="ml-auto">
            <input type="hidden" name="eventId" value={id} />
            <input type="hidden" name="playerId" value={leagueMe.id} />
            <button
              type="submit"
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              Continue as {leagueMe.displayName} →
            </button>
          </form>
        </div>
      )}

      {!me && leagueMe && !onRoster && event.status === "draft" && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="text-amber-200">
            You&apos;re <strong>{leagueMe.displayName}</strong> from{" "}
            {league?.name ?? "this league"} — this event hasn&apos;t started,
            so grab a seat.
          </span>
          <form action={joinEventAction} className="ml-auto">
            <input type="hidden" name="eventId" value={id} />
            <button
              type="submit"
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              Join as {leagueMe.displayName} →
            </button>
          </form>
        </div>
      )}

      {!me && leagueMe && !onRoster && event.status !== "draft" && (
        <div className="mb-6 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
          You&apos;re <strong>{leagueMe.displayName}</strong> in{" "}
          {league?.name ?? "this league"}, but this event has already started
          and you&apos;re not in its lineup — ask the organizer to add you.{" "}
          {league && (
            <Link
              href={`/leagues/${league.slug}`}
              className="text-amber-400/90 underline-offset-2 transition hover:text-amber-300 hover:underline"
            >
              Back to {league.name} →
            </Link>
          )}
        </div>
      )}

      {showBanner && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <span className="text-emerald-300">
            Claimed as <strong>{me.displayName}</strong>
          </span>
          <Link
            href={`/events/${id}/play`}
            className="ml-auto rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            Continue to play →
          </Link>
          <Link
            href={`/events/${id}/claim?switch=1`}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Switch player
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {roster.map((p) => (
          <div key={p.playerId} className="relative">
            <form action={claimIdentityAction}>
              <input type="hidden" name="eventId" value={id} />
              <input type="hidden" name="playerId" value={p.playerId} />
              <button
                type="submit"
                aria-label={`Claim ${p.displayName}`}
                className={`group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-zinc-900 text-left transition active:scale-[0.98] ${
                  me?.playerId === p.playerId
                    ? "border-emerald-500/60 ring-2 ring-emerald-500/60"
                    : "border-zinc-800 hover:border-amber-500/60"
                }`}
              >
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center">
                    <span className="grid h-20 w-20 place-items-center rounded-full border-2 border-dashed border-amber-500/60 font-mono text-3xl text-amber-400/80">
                      {p.displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div
                  className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-6 text-center text-lg font-semibold tracking-tight text-white"
                  style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}
                >
                  {p.displayName}
                </div>
              </button>
            </form>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-zinc-500">
        Don&apos;t see your face?{" "}
        {league ? (
          <>
            <Link
              href={`/leagues/${league.slug}/claim?event=${id}`}
              className="text-amber-400/90 underline-offset-2 transition hover:text-amber-300 hover:underline"
            >
              Create your wizard in {league.name}
            </Link>{" "}
            or ask the organizer for your join link.
          </>
        ) : (
          <>Ask the organizer for your join link.</>
        )}
      </p>
      </main>
    </AppChrome>
  );
}
