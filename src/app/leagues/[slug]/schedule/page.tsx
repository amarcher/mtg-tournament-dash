import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug, listLeaguePolls } from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { AppChrome, StatusBadge } from "@/app/components/AppChrome";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const [polls, me] = await Promise.all([
    listLeaguePolls(league.id),
    getCurrentLeaguePlayer(league.id),
  ]);

  return (
    <AppChrome league={league} player={me} active="schedule">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Draft night scheduling
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Doodle-style polls for deciding when the league meets next.
            </p>
          </div>
          <Link
            href={`/leagues/${league.slug}/schedule/new`}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Propose dates
          </Link>
        </div>

        {polls.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-500">
            No polls yet. Propose a few dates to get the next draft night on
            the calendar.
          </div>
        ) : (
          <ul className="space-y-2">
            {polls.map((poll) => (
              <li key={poll.id}>
                <Link
                  href={`/leagues/${league.slug}/schedule/${poll.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4 transition hover:border-zinc-700 hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="truncate font-medium">{poll.title}</span>
                    <StatusBadge status={poll.status} />
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {formatDate(poll.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppChrome>
  );
}
