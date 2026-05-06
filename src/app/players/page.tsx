import Link from "next/link";
import { getHeadToHeadMatrix, listAllPlayers } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const [players, h2h] = await Promise.all([
    listAllPlayers(),
    getHeadToHeadMatrix(),
  ]);

  return (
    <main className="mx-auto max-w-5xl w-full px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Home
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Players</h1>
      </div>

      {players.length === 0 ? (
        <p className="text-sm text-zinc-500">No players yet.</p>
      ) : (
        <>
          <section className="mb-12">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
              Leaderboard
            </h2>
            <ol className="space-y-1">
              {players.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-6 text-right font-mono text-xs text-zinc-500">
                      {i + 1}
                    </span>
                    <Link
                      href={`/players/${p.id}`}
                      aria-label={`Open ${p.displayName}`}
                      className="shrink-0"
                    >
                      {p.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.avatarUrl}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover ring-1 ring-zinc-700 transition hover:ring-amber-400"
                        />
                      ) : (
                        <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-zinc-600 font-mono text-xs text-zinc-500 transition hover:border-amber-400 hover:text-amber-400">
                          {p.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </Link>
                    <Link
                      href={`/players/${p.id}`}
                      className="font-medium hover:text-amber-400"
                    >
                      {p.displayName}
                    </Link>
                  </span>
                  <span className="font-mono text-sm text-zinc-400">
                    {p.currentElo}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
              Head-to-head (rows beat columns)
            </h2>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="px-2 py-1"></th>
                    {players.map((p) => (
                      <th
                        key={p.id}
                        className="px-2 py-1 text-xs font-medium text-zinc-500"
                        title={p.displayName}
                      >
                        {p.displayName.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((winner) => (
                    <tr key={winner.id} className="border-t border-zinc-800">
                      <th className="px-2 py-1 text-left text-xs font-medium text-zinc-400">
                        {winner.displayName}
                      </th>
                      {players.map((loser) => {
                        if (winner.id === loser.id)
                          return (
                            <td
                              key={loser.id}
                              className="px-3 py-1 text-center text-zinc-700"
                            >
                              ·
                            </td>
                          );
                        const count = h2h.get(winner.id)?.get(loser.id) ?? 0;
                        return (
                          <td
                            key={loser.id}
                            className={`px-3 py-1 text-center font-mono ${
                              count > 0 ? "text-zinc-100" : "text-zinc-700"
                            }`}
                          >
                            {count > 0 ? count : "·"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
