import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug } from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { isLeagueOrganizer } from "@/lib/authz";
import { createGameNightsAction } from "@/app/events/actions";
import { AppChrome } from "@/app/components/AppChrome";
import { NightSeriesField } from "./NightSeriesField";

export const dynamic = "force-dynamic";

export default async function NewGameNightsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const [me, organizer] = await Promise.all([
    getCurrentLeaguePlayer(league.id),
    isLeagueOrganizer(league),
  ]);

  return (
    <AppChrome
      league={league}
      player={me}
      isOrganizer={organizer}
      active="schedule"
    >
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Open dates on the calendar
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Put a run of nights up front — the league RSVPs to each one and the
            plan (set, host, venue) fills in as it firms up.{" "}
            <Link
              href={`/leagues/${league.slug}/schedule`}
              className="text-amber-400 hover:text-amber-300"
            >
              Back to the schedule
            </Link>
          </p>
        </div>

        {!organizer ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            Only league organizers can open dates. Anyone can still{" "}
            <Link
              href={`/leagues/${league.slug}/schedule/new`}
              className="text-amber-400 hover:text-amber-300"
            >
              propose dates in a poll
            </Link>
            .
          </div>
        ) : (
          <form action={createGameNightsAction}>
            <input type="hidden" name="leagueId" value={league.id} />
            <NightSeriesField />
          </form>
        )}
      </main>
    </AppChrome>
  );
}
