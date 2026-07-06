import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug } from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { createDatePollAction } from "@/app/events/actions";
import { AppChrome } from "@/app/components/AppChrome";
import { DateOptionsField } from "./DateOptionsField";

export const dynamic = "force-dynamic";

export default async function NewSchedulePollPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const me = await getCurrentLeaguePlayer(league.id);

  return (
    <AppChrome league={league} player={me} active="schedule">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Propose draft nights
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Pick a few candidate dates — the league votes on what works.
          </p>
        </div>

        {!me ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            You need a wizard in {league.name} to open a poll.{" "}
            <Link
              href={`/leagues/${league.slug}/claim`}
              className="text-amber-400 hover:text-amber-300"
            >
              Claim your wizard
            </Link>{" "}
            first.
          </div>
        ) : (
          <form action={createDatePollAction} className="space-y-6">
            <input type="hidden" name="leagueId" value={league.id} />
            <input type="hidden" name="playerId" value={me.id} />
            <div>
              <label
                htmlFor="poll-title"
                className="mb-1 block text-sm font-medium text-zinc-300"
              >
                Title
              </label>
              <input
                id="poll-title"
                name="title"
                defaultValue="Next draft night"
                autoComplete="off"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Candidate dates
              </label>
              <DateOptionsField />
            </div>
            <button
              type="submit"
              className="rounded-full bg-amber-500 px-6 py-2.5 font-semibold text-zinc-950 hover:bg-amber-400"
            >
              Open poll
            </button>
          </form>
        )}
      </main>
    </AppChrome>
  );
}
