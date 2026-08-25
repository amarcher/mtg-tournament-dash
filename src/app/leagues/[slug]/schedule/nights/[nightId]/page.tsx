import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  getNightDetail,
  listLeaguePlayers,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { isLeagueOrganizer } from "@/lib/authz";
import {
  deleteGameNightAction,
  promoteGameNightAction,
  updateGameNightAction,
} from "@/app/events/actions";
import { AppChrome, StatusBadge } from "@/app/components/AppChrome";
import {
  ClearRsvpButton,
  NightPlanLine,
  RsvpButtons,
  responseRing,
} from "@/app/components/GameNightCard";
import {
  POLL_RESPONSE_LABELS,
  formatPollDate,
  toDateTimeLocal,
  type PollResponseValue,
} from "@/lib/schedule-types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; nightId: string }>;
}) {
  const { slug, nightId } = await params;
  const [league, night] = await Promise.all([
    getLeagueBySlug(slug),
    getNightDetail(nightId),
  ]);
  if (!league || !night || night.leagueId !== league.id) return {};
  const going = night.rsvps.filter((r) => r.response === "yes").length;
  const title = `${formatPollDate(night.startsAt)} · ${league.name}`;
  const description = `${going} in so far${night.setName ? ` · ${night.setName}` : ""}${
    night.hostName ? ` · hosted by ${night.hostName}` : ""
  }`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-base [color-scheme:dark] focus:border-amber-500 focus:outline-none";

export default async function GameNightPage({
  params,
}: {
  params: Promise<{ slug: string; nightId: string }>;
}) {
  const { slug, nightId } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const night = await getNightDetail(nightId);
  if (!night || night.leagueId !== league.id) notFound();

  const [leaguePlayers, me, organizer] = await Promise.all([
    listLeaguePlayers(league.id),
    getCurrentLeaguePlayer(league.id),
    isLeagueOrganizer(league),
  ]);

  const byResponse = (r: PollResponseValue) =>
    night.rsvps.filter((v) => v.response === r);
  const answered = new Set(night.rsvps.map((r) => r.playerId));
  const silent = leaguePlayers.filter((p) => !answered.has(p.id));
  const mine = me
    ? night.rsvps.find((r) => r.playerId === me.id)?.response
    : undefined;
  const canceled = night.status === "canceled";

  return (
    <AppChrome
      league={league}
      player={me}
      isOrganizer={organizer}
      active="schedule"
    >
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {formatPollDate(night.startsAt)}
            </h1>
            <StatusBadge status={night.status} />
          </div>
          <div className="mt-2">
            <NightPlanLine night={night} />
          </div>
          {night.notes && (
            <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">
              {night.notes}
            </p>
          )}
          <Link
            href={`/leagues/${league.slug}/schedule`}
            className="mt-2 inline-block text-sm text-amber-400 hover:text-amber-300"
          >
            ← Whole schedule
          </Link>
        </div>

        {me ? (
          !canceled && (
            <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="mb-3 text-sm font-medium text-zinc-300">
                Are you in? Change it any time.
              </h2>
              <RsvpButtons nightId={night.id} playerId={me.id} mine={mine} />
              {mine && (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    Tap your answer again to take it back.
                  </p>
                  <ClearRsvpButton nightId={night.id} playerId={me.id} />
                </div>
              )}
            </section>
          )
        ) : (
          <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            <Link
              href={`/leagues/${league.slug}/claim`}
              className="text-amber-400 hover:text-amber-300"
            >
              Claim your wizard
            </Link>{" "}
            to RSVP.
          </div>
        )}

        <section className="mb-10 space-y-4">
          {(["yes", "if_need_be", "no"] as const).map((r) => {
            const group = byResponse(r);
            return (
              <div key={r}>
                <h3 className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                  {POLL_RESPONSE_LABELS[r]} · {group.length}
                </h3>
                {group.length === 0 ? (
                  <p className="text-sm text-zinc-600">Nobody yet.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {group.map((v) => (
                      <li
                        key={v.playerId}
                        className="flex items-center gap-2 rounded-full bg-zinc-900 py-1 pl-1 pr-3 text-sm"
                      >
                        {v.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.avatarUrl}
                            alt=""
                            className={`h-7 w-7 rounded-full object-cover ring-2 ${responseRing[r]}`}
                          />
                        ) : (
                          <span
                            className={`grid h-7 w-7 place-items-center rounded-full bg-zinc-800 font-mono text-xs ring-2 ${responseRing[r]}`}
                          >
                            {v.displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        {v.displayName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {silent.length > 0 && (
            <p className="text-xs text-zinc-500">
              No answer yet: {silent.map((p) => p.displayName).join(", ")}
            </p>
          )}
        </section>

        {organizer && (
          <section className="mb-10 rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-lg font-medium text-zinc-200">The plan</h2>
            <p className="mt-1 text-xs text-zinc-500">
              What&apos;s being drafted, who&apos;s hosting, and where.
            </p>
            <form
              action={updateGameNightAction}
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="nightId" value={night.id} />
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">
                  Date &amp; time
                </span>
                <input
                  type="datetime-local"
                  name="startsAt"
                  step={900}
                  defaultValue={toDateTimeLocal(night.startsAt)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">Status</span>
                <select
                  name="status"
                  defaultValue={night.status}
                  className={inputClass}
                >
                  <option value="planned">Planned</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="canceled">Canceled</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">Set</span>
                <input
                  name="setName"
                  defaultValue={night.setName ?? ""}
                  placeholder="e.g. Tales of Middle-earth"
                  autoComplete="off"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">Host</span>
                <select
                  name="hostPlayerId"
                  defaultValue={night.hostPlayerId ?? ""}
                  className={inputClass}
                >
                  <option value="">Not decided</option>
                  {leaguePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm text-zinc-400">Venue</span>
                <input
                  name="venue"
                  defaultValue={night.venue ?? ""}
                  placeholder="e.g. Andrew's basement"
                  autoComplete="off"
                  className={inputClass}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm text-zinc-400">Notes</span>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={night.notes ?? ""}
                  placeholder="Snacks, start time flexibility, anything else"
                  className={inputClass}
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-full bg-amber-500 px-6 font-semibold text-zinc-950 transition hover:bg-amber-400 active:bg-amber-400 sm:w-auto"
                >
                  Save the plan
                </button>
              </div>
            </form>
          </section>
        )}

        {night.event ? (
          <section className="mb-10 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">
              Event created
            </div>
            <Link
              href={`/events/${night.event.id}/manage`}
              className="mt-1 inline-block text-lg font-semibold text-emerald-100 hover:text-emerald-50"
            >
              {night.event.name} →
            </Link>
          </section>
        ) : (
          organizer &&
          !canceled && (
            <section className="mb-10 rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-lg font-medium text-zinc-200">
                Ready to play
              </h2>
              <form
                action={promoteGameNightAction}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="nightId" value={night.id} />
                <label htmlFor="promote-night-name" className="sr-only">
                  Event name
                </label>
                <input
                  id="promote-night-name"
                  name="name"
                  defaultValue={
                    night.setName
                      ? `${night.setName} draft`
                      : `Draft night · ${formatPollDate(night.startsAt)}`
                  }
                  className={`${inputClass} min-w-0 flex-1 sm:w-auto`}
                />
                <button
                  type="submit"
                  className="min-h-11 rounded-full bg-emerald-500 px-5 font-semibold text-zinc-950 transition hover:bg-emerald-400 active:bg-emerald-400"
                >
                  Create the event
                </button>
                <p className="w-full text-xs text-zinc-400">
                  Pre-rosters everyone who&apos;s ✅ or 🟡 for this night (or
                  the whole league if fewer than two are), and carries the set
                  across.
                </p>
              </form>
            </section>
          )
        )}

        {organizer && !night.event && (
          <form action={deleteGameNightAction}>
            <input type="hidden" name="nightId" value={night.id} />
            <button
              type="submit"
              className="min-h-11 rounded-md border border-zinc-800 px-4 text-sm text-zinc-500 transition hover:border-rose-500/60 hover:text-rose-300 active:bg-zinc-900"
            >
              Remove this date from the calendar
            </button>
          </form>
        )}
      </main>
    </AppChrome>
  );
}
