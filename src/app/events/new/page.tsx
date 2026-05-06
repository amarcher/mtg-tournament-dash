import Link from "next/link";
import { listAllPlayers } from "@/db/queries";
import { addPlayerAction, createEventAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const players = await listAllPlayers();

  return (
    <main className="mx-auto max-w-2xl w-full px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Home
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">New event</h1>
      </div>

      <section className="mb-10 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Add a player
        </h2>
        <form action={addPlayerAction} className="flex gap-2">
          <input
            name="name"
            required
            placeholder="Display name"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-600"
          >
            Add
          </button>
        </form>
      </section>

      <form action={createEventAction} className="space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">
            Event name
          </label>
          <input
            name="name"
            required
            placeholder="Friday Night Magic — May"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Total rounds
            </label>
            <input
              name="totalRounds"
              type="number"
              min={1}
              max={9}
              defaultValue={3}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Starting life
            </label>
            <input
              name="startingLife"
              type="number"
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
              No players yet. Add some above.
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
  );
}
