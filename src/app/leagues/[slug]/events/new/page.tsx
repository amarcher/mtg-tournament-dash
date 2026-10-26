import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug, listLeaguePlayers } from "@/db/queries";
import { addPlayerAction, createEventAction } from "@/app/events/actions";
import { AppChrome } from "@/app/components/AppChrome";
import { OrganizerGate } from "@/app/components/OrganizerGate";
import { isLeagueOrganizer } from "@/lib/authz";
import { readOrganizerModeCookie } from "@/lib/organizer-mode";

export const dynamic = "force-dynamic";

export default async function NewLeagueEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  if (!(await isLeagueOrganizer(league))) {
    return (
      <OrganizerGate league={league} next={`/leagues/${slug}/events/new`} />
    );
  }
  const players = await listLeaguePlayers(league.id);

  return (
    <AppChrome
      league={league}
      isOrganizer
      organizerMode={await readOrganizerModeCookie()}
      active="organize"
    >
      <main className="mx-auto max-w-2xl w-full px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8">
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          New event
        </h1>
      </div>

      <section className="mb-10 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Add a player to {league.name}
        </h2>
        <form action={addPlayerAction} className="flex gap-2">
          <input type="hidden" name="leagueId" value={league.id} />
          <label htmlFor="add-player-name" className="sr-only">
            Display name
          </label>
          <input
            id="add-player-name"
            name="name"
            required
            placeholder="Display name"
            autoComplete="name"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-600"
          >
            Add
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500">
          Players can also self-create from{" "}
          <Link
            href={`/leagues/${league.slug}/claim`}
            className="text-amber-400 hover:text-amber-300"
          >
            the claim page
          </Link>
          .
        </p>
      </section>

      <form action={createEventAction} className="space-y-6">
        <input type="hidden" name="leagueId" value={league.id} />
        <div>
          <label htmlFor="event-name" className="mb-1 block text-sm font-medium text-zinc-300">
            Event name
          </label>
          <input
            id="event-name"
            name="name"
            required
            placeholder="Friday Night Magic — May"
            autoComplete="off"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-zinc-300">
            Format
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900 p-3 has-[:checked]:border-amber-500/60 has-[:checked]:bg-amber-500/10">
              <input
                type="radio"
                name="format"
                value="swiss"
                defaultChecked
                className="mt-1 h-4 w-4 accent-amber-500"
              />
              <span>
                <span className="block font-medium">Swiss</span>
                <span className="block text-xs text-zinc-400">
                  Everyone for themselves. Pairings follow the standings each
                  round.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900 p-3 has-[:checked]:border-amber-500/60 has-[:checked]:bg-amber-500/10">
              <input
                type="radio"
                name="format"
                value="team_draft"
                className="mt-1 h-4 w-4 accent-amber-500"
              />
              <span>
                <span className="block font-medium">Team draft</span>
                <span className="block text-xs text-zinc-400">
                  Two teams seated A-B-A-B. Every player faces each opponent
                  on the other team once; most match wins takes it. Needs an
                  even headcount — rounds are set automatically.
                </span>
              </span>
            </label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="team-a-name" className="mb-1 block text-xs font-medium uppercase tracking-wide text-sky-300">
                Team A name
              </label>
              <input
                id="team-a-name"
                name="teamAName"
                placeholder="Team A"
                maxLength={40}
                autoComplete="off"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="team-b-name" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fuchsia-300">
                Team B name
              </label>
              <input
                id="team-b-name"
                name="teamBName"
                placeholder="Team B"
                maxLength={40}
                autoComplete="off"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <p className="col-span-2 -mt-2 text-xs text-zinc-500">
              Team names only apply to a team draft. Teams start balanced by
              ELO; rearrange them on the manage page.
            </p>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="event-set" className="mb-1 block text-sm font-medium text-zinc-300">
              Set being drafted (optional)
            </label>
            <input
              id="event-set"
              name="setName"
              placeholder="e.g. Tales of Middle-earth"
              autoComplete="off"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="total-rounds" className="mb-1 block text-sm font-medium text-zinc-300">
              Total rounds{" "}
              <span className="font-normal text-zinc-500">(Swiss)</span>
            </label>
            <input
              id="total-rounds"
              name="totalRounds"
              type="number"
              inputMode="numeric"
              min={1}
              max={9}
              defaultValue={3}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="starting-life" className="mb-1 block text-sm font-medium text-zinc-300">
              Starting life
            </label>
            <input
              id="starting-life"
              name="startingLife"
              type="number"
              inputMode="numeric"
              min={1}
              defaultValue={20}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Players
          </label>
          {players.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No players in this league yet. Add some above or share the claim
              page.
            </p>
          ) : (
            <ul className="space-y-1 rounded-md border border-zinc-800 bg-zinc-900 p-3">
              {players.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-800">
                    <input
                      type="checkbox"
                      name="playerId"
                      value={p.id}
                      defaultChecked
                      className="h-4 w-4 accent-amber-500"
                    />
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="h-7 w-7 shrink-0 rounded-full border border-dashed border-zinc-700" />
                    )}
                    <span className="flex-1">{p.displayName}</span>
                    <span className="font-mono text-xs text-zinc-500">
                      {p.currentElo}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          className="rounded-full btn-gold px-6 py-2.5"
        >
          Create event
        </button>
      </form>
      </main>
    </AppChrome>
  );
}
