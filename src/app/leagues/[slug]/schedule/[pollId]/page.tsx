import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDatePoll,
  getLeagueBySlug,
  getPollDetail,
  listLeaguePlayers,
  type PollVoteRow,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { isLeagueOrganizer } from "@/lib/authz";
import {
  castPollVotesAction,
  finalizeDatePollAction,
} from "@/app/events/actions";
import { AppChrome, StatusBadge } from "@/app/components/AppChrome";
import {
  POLL_RESPONSES,
  POLL_RESPONSE_LABELS,
  formatPollDate,
  type PollResponseValue,
} from "@/lib/schedule-types";
import { pickLeadingOptionId, tallyResponses } from "@/lib/poll-tally";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; pollId: string }>;
}) {
  const { slug, pollId } = await params;
  const [league, poll] = await Promise.all([
    getLeagueBySlug(slug),
    getDatePoll(pollId),
  ]);
  if (!league || !poll || poll.leagueId !== league.id) return {};

  const options = await getPollDetail(poll.id);
  const winner = poll.finalizedOptionId
    ? options.find((o) => o.id === poll.finalizedOptionId)
    : null;
  const description = winner
    ? `Draft night is set: ${formatPollDate(winner.startsAt)}.`
    : `Vote on a date: ${options
        .slice(0, 4)
        .map((o) => formatPollDate(o.startsAt))
        .join(" · ")}${options.length > 4 ? ` (+${options.length - 4} more)` : ""}`;

  const title = `${poll.title} · ${league.name}`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

const responseTone: Record<PollResponseValue, string> = {
  yes: "ring-emerald-400",
  if_need_be: "ring-amber-400",
  no: "ring-rose-400",
};

export default async function SchedulePollPage({
  params,
}: {
  params: Promise<{ slug: string; pollId: string }>;
}) {
  const { slug, pollId } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const poll = await getDatePoll(pollId);
  if (!poll || poll.leagueId !== league.id) notFound();

  const [options, leaguePlayers, me, organizer] = await Promise.all([
    getPollDetail(poll.id),
    listLeaguePlayers(league.id),
    getCurrentLeaguePlayer(league.id),
    isLeagueOrganizer(league),
  ]);

  const voterIds = new Set(
    options.flatMap((o) => o.votes.map((v) => v.playerId))
  );
  const leadingId = pickLeadingOptionId(
    options.map((o) => ({
      id: o.id,
      startsAt: o.startsAt,
      responses: o.votes.map((v) => v.response),
    }))
  );
  const winner =
    poll.status === "finalized"
      ? options.find((o) => o.id === poll.finalizedOptionId) ?? null
      : null;
  const isOpen = poll.status === "open";
  const myResponseFor = (votes: PollVoteRow[]) =>
    me ? votes.find((v) => v.playerId === me.id)?.response : undefined;

  const optionCards = options.map((o) => {
    const tally = tallyResponses(o.votes.map((v) => v.response));
    const isLeading = isOpen && o.id === leadingId;
    const isWinner = winner?.id === o.id;
    return (
      <li
        key={o.id}
        className={`rounded-lg border p-4 ${
          isWinner
            ? "border-emerald-500/60 bg-emerald-500/10"
            : isLeading
              ? "border-amber-500/60 bg-amber-500/5"
              : "border-zinc-800 bg-zinc-900"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">{formatPollDate(o.startsAt)}</div>
          <div className="flex items-center gap-2 text-xs">
            {isLeading && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-semibold uppercase tracking-wide text-amber-300">
                Leading
              </span>
            )}
            {isWinner && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-semibold uppercase tracking-wide text-emerald-300">
                It&apos;s happening
              </span>
            )}
            <span className="font-mono text-zinc-400">
              ✅ {tally.yes} · 🟡 {tally.ifNeedBe} · ❌ {tally.no}
            </span>
          </div>
        </div>

        {o.votes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {o.votes.map((v) => (
              <span
                key={v.playerId}
                title={`${v.displayName}: ${POLL_RESPONSE_LABELS[v.response]}`}
                className="flex items-center gap-1.5 rounded-full bg-zinc-950/60 py-0.5 pl-0.5 pr-2 text-xs text-zinc-300"
              >
                {v.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.avatarUrl}
                    alt=""
                    className={`h-6 w-6 rounded-full object-cover ring-2 ${responseTone[v.response]}`}
                  />
                ) : (
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full bg-zinc-800 font-mono text-[10px] ring-2 ${responseTone[v.response]}`}
                  >
                    {v.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                {v.displayName}
              </span>
            ))}
          </div>
        )}

        {me && isOpen && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {POLL_RESPONSES.map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-center justify-center rounded-md border border-zinc-700 px-2 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-500/10 has-[:checked]:text-zinc-50"
              >
                <input
                  type="radio"
                  name={`response_${o.id}`}
                  value={r}
                  defaultChecked={myResponseFor(o.votes) === r}
                  className="sr-only"
                />
                {POLL_RESPONSE_LABELS[r]}
              </label>
            ))}
          </div>
        )}
      </li>
    );
  });

  return (
    <AppChrome league={league} player={me} isOrganizer={organizer} active="schedule">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {poll.title}
            </h1>
            <StatusBadge status={poll.status} />
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            {voterIds.size} of {leaguePlayers.length} wizards have weighed in.{" "}
            <Link
              href={`/leagues/${league.slug}/schedule`}
              className="text-amber-400 hover:text-amber-300"
            >
              All polls
            </Link>
          </p>
        </div>

        {winner && (
          <div className="mb-8 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">
              Draft night is set
            </div>
            <div className="mt-1 text-2xl font-semibold text-emerald-100">
              {formatPollDate(winner.startsAt)}
            </div>
          </div>
        )}

        {!me && (
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            <Link
              href={`/leagues/${league.slug}/claim`}
              className="text-amber-400 hover:text-amber-300"
            >
              Claim your wizard
            </Link>{" "}
            to mark your availability.
          </div>
        )}

        {me && isOpen ? (
          <form action={castPollVotesAction}>
            <input type="hidden" name="pollId" value={poll.id} />
            <input type="hidden" name="playerId" value={me.id} />
            <ul className="space-y-3">{optionCards}</ul>
            <button
              type="submit"
              className="mt-6 w-full rounded-full bg-amber-500 px-6 py-2.5 font-semibold text-zinc-950 hover:bg-amber-400 sm:w-auto"
            >
              Save availability
            </button>
          </form>
        ) : (
          <ul className="space-y-3">{optionCards}</ul>
        )}

        {me && isOpen && (
          <section className="mt-12">
            <h2 className="text-lg font-medium text-zinc-300">Lock it in</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Once the group has settled, pick the winning date to close the
              poll.
            </p>
            <ul className="mt-4 space-y-2">
              {options.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm"
                >
                  <span>{formatPollDate(o.startsAt)}</span>
                  <form action={finalizeDatePollAction}>
                    <input type="hidden" name="pollId" value={poll.id} />
                    <input type="hidden" name="playerId" value={me.id} />
                    <input type="hidden" name="optionId" value={o.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-700 px-3 py-1.5 font-medium text-zinc-200 transition hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-200"
                    >
                      Pick this date
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </AppChrome>
  );
}
