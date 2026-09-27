import Link from "next/link";
import type { NightWithRsvps } from "@/db/queries";
import { rsvpGameNightAction } from "@/app/events/actions";
import {
  POLL_RESPONSES,
  POLL_RESPONSE_LABELS,
  formatPollDate,
  type PollResponseValue,
} from "@/lib/schedule-types";
import { tallyResponses } from "@/lib/poll-tally";

export const responseRing: Record<PollResponseValue, string> = {
  yes: "ring-emerald-400",
  if_need_be: "ring-amber-400",
  no: "ring-rose-400",
};

const rsvpTone: Record<PollResponseValue, string> = {
  yes: "border-emerald-400/70 bg-emerald-500/15 text-emerald-200",
  if_need_be: "border-amber-400/70 bg-amber-500/15 text-amber-100",
  no: "border-rose-400/70 bg-rose-500/15 text-rose-200",
};

export const responseDot: Record<PollResponseValue, string> = {
  yes: "bg-emerald-400",
  if_need_be: "bg-amber-400",
  no: "bg-rose-400",
};

/**
 * One tap = one RSVP. Three submit buttons in a single form rather than a
 * radio group + save, so a phone never has to hit a second control — plans
 * change often enough that the round trip has to be cheap.
 *
 * The button you're currently on submits `clear` instead of its own value,
 * so tapping it again withdraws the answer and drops you back to the
 * un-answered list. Without that, an answer tapped on the wrong phone (or
 * as the wrong wizard) would be stuck as *some* answer forever.
 */
export function RsvpButtons({
  nightId,
  playerId,
  mine,
  disabled = false,
}: {
  nightId: string;
  playerId: string;
  mine?: PollResponseValue;
  disabled?: boolean;
}) {
  return (
    <form action={rsvpGameNightAction} className="grid grid-cols-3 gap-2">
      <input type="hidden" name="nightId" value={nightId} />
      <input type="hidden" name="playerId" value={playerId} />
      {POLL_RESPONSES.map((r) => {
        const isMine = mine === r;
        return (
          <button
            key={r}
            type="submit"
            name="response"
            value={isMine ? "clear" : r}
            disabled={disabled}
            aria-pressed={isMine}
            title={
              isMine
                ? `Tap again to clear your ${POLL_RESPONSE_LABELS[r]} answer`
                : undefined
            }
            className={`flex min-h-12 items-center justify-center gap-2 rounded-[8px] border px-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40 ${
              isMine
                ? rsvpTone[r]
                : "border-line text-ink-dim hover:bg-white/5 active:bg-white/5"
            }`}
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${responseDot[r]}`} />
            {POLL_RESPONSE_LABELS[r]}
          </button>
        );
      })}
    </form>
  );
}

/**
 * The explicit way out, shown only once you have an answer — the tap-again
 * toggle above is faster but invisible, and "I answered as the wrong
 * wizard" is exactly the moment you need a control you can *see*.
 */
export function ClearRsvpButton({
  nightId,
  playerId,
  className = "",
}: {
  nightId: string;
  playerId: string;
  className?: string;
}) {
  return (
    <form action={rsvpGameNightAction} className={className}>
      <input type="hidden" name="nightId" value={nightId} />
      <input type="hidden" name="playerId" value={playerId} />
      <button
        type="submit"
        name="response"
        value="clear"
        className="min-h-11 rounded-md px-2 text-xs text-zinc-500 underline decoration-dotted underline-offset-4 transition hover:text-zinc-300 active:text-zinc-300"
      >
        Clear my answer
      </button>
    </form>
  );
}

export function RsvpFaces({ rsvps }: { rsvps: NightWithRsvps["rsvps"] }) {
  if (rsvps.length === 0) {
    return <p className="text-xs text-zinc-500">No answers yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {rsvps.map((r) => (
        <span
          key={r.playerId}
          title={`${r.displayName}: ${POLL_RESPONSE_LABELS[r.response]}`}
          className="flex items-center gap-1.5 rounded-full bg-white/[0.05] py-0.5 pl-0.5 pr-2 text-xs text-ink"
        >
          {r.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.avatarUrl}
              alt=""
              className={`h-6 w-6 rounded-full object-cover ring-2 ${responseRing[r.response]}`}
            />
          ) : (
            <span
              className={`grid h-6 w-6 place-items-center rounded-full bg-zinc-800 font-mono text-[10px] ring-2 ${responseRing[r.response]}`}
            >
              {r.displayName.charAt(0).toUpperCase()}
            </span>
          )}
          {r.displayName}
        </span>
      ))}
    </div>
  );
}

/** The plan for a night, as a single line: set · host @ venue. */
export function NightPlanLine({ night }: { night: NightWithRsvps }) {
  const bits = [
    night.setName,
    night.hostName ? `Host: ${night.hostName}` : null,
    night.venue,
  ].filter(Boolean);
  return bits.length ? (
    <p className="text-sm text-ink-dim">{bits.join(" · ")}</p>
  ) : (
    <p className="text-sm text-ink-faint">Set and host still to be decided</p>
  );
}

export function GameNightCard({
  night,
  leagueSlug,
  playerId,
  organizerMode = false,
}: {
  night: NightWithRsvps;
  leagueSlug: string;
  playerId?: string | null;
  /** Organizers in organizer mode jump to the console; everyone else to
   * their seat. */
  organizerMode?: boolean;
}) {
  const tally = tallyResponses(night.rsvps.map((r) => r.response));
  const canceled = night.status === "canceled";
  const mine = playerId
    ? night.rsvps.find((r) => r.playerId === playerId)?.response
    : undefined;

  return (
    <li
      className={`rounded-[12px] border p-4 shadow-e1 ${
        canceled
          ? "border-line bg-surface opacity-60"
          : night.status === "confirmed"
            ? "border-emerald-400/40 bg-[linear-gradient(135deg,rgb(79_224_139/0.08),transparent_60%),var(--color-surface)]"
            : "border-line bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link
          href={`/leagues/${leagueSlug}/schedule/nights/${night.id}`}
          className="font-display text-base font-bold transition hover:text-gold active:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          {formatPollDate(night.startsAt)}
          {canceled && (
            <span className="ml-2 text-sm font-normal text-rose-300">
              canceled
            </span>
          )}
        </Link>
        <span
          className="flex items-center gap-2.5 text-xs font-semibold tabular-nums text-ink-dim"
          aria-label={`${tally.yes} yes, ${tally.ifNeedBe} maybe, ${tally.no} no`}
        >
          <span className="flex items-center gap-1"><span aria-hidden className={`h-2 w-2 rounded-full ${responseDot.yes}`} />{tally.yes}</span>
          <span className="flex items-center gap-1"><span aria-hidden className={`h-2 w-2 rounded-full ${responseDot.if_need_be}`} />{tally.ifNeedBe}</span>
          <span className="flex items-center gap-1"><span aria-hidden className={`h-2 w-2 rounded-full ${responseDot.no}`} />{tally.no}</span>
        </span>
      </div>

      <div className="mt-1">
        <NightPlanLine night={night} />
      </div>

      {night.rsvps.length > 0 && (
        <div className="mt-3">
          <RsvpFaces rsvps={night.rsvps} />
        </div>
      )}

      {playerId && !canceled && (
        <div className="mt-4">
          <RsvpButtons nightId={night.id} playerId={playerId} mine={mine} />
        </div>
      )}

      {/* The date itself links here too, but a bare date doesn't read as a
          link — and the plan (set, format, host, venue) is only editable on
          the other side of it. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/leagues/${leagueSlug}/schedule/nights/${night.id}`}
          className="min-h-11 py-3 text-xs font-medium text-amber-400 transition hover:text-amber-300 active:text-amber-300"
        >
          Plan &amp; who&apos;s in →
        </Link>
        {playerId && mine && !canceled && (
          <ClearRsvpButton nightId={night.id} playerId={playerId} />
        )}
      </div>

      {night.event && (
        <Link
          href={
            organizerMode
              ? `/events/${night.event.id}/manage`
              : `/events/${night.event.id}/play`
          }
          className="mt-1 inline-block text-sm font-medium text-emerald-300 hover:text-emerald-200"
        >
          Event ready: {night.event.name} →
        </Link>
      )}
    </li>
  );
}
