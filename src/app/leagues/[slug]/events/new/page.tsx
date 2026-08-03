import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug, listLeaguePlayers } from "@/db/queries";
import { addPlayerAction, createEventAction } from "@/app/events/actions";
import { AppChrome } from "@/app/components/AppChrome";
import { OrganizerGate } from "@/app/components/OrganizerGate";
import { isLeagueOrganizer } from "@/lib/authz";

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
    <AppChrome league={league} isOrganizer active="events">
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
            <label htmlFor="event-theme" className="mb-1 block text-sm font-medium text-zinc-300">
              Portrait theme (optional)
            </label>
            <input
              id="event-theme"
              name="portraitTheme"
              placeholder="e.g. a Lord of the Rings character"
              autoComplete="off"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="total-rounds" className="mb-1 block text-sm font-medium text-zinc-300">
              Total rounds
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
          className="rounded-full bg-amber-500 px-6 py-2.5 font-semibold text-zinc-950 hover:bg-amber-400"
        >
          Create event
        </button>
      </form>
      </main>
    </AppChrome>
  );
}
