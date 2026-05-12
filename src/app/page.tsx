import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { events, players } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { listLeagues } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const all = await listLeagues();

  if (all.length === 1) {
    redirect(`/leagues/${all[0].slug}`);
  }

  const counts = await Promise.all(
    all.map(async (l) => {
      const [playerCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(players)
        .where(eq(players.leagueId, l.id));
      const [openCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(events)
        .where(eq(events.leagueId, l.id));
      const [latest] = await db
        .select({ name: events.name, createdAt: events.createdAt })
        .from(events)
        .where(eq(events.leagueId, l.id))
        .orderBy(desc(events.createdAt))
        .limit(1);
      return {
        league: l,
        players: playerCount?.n ?? 0,
        events: openCount?.n ?? 0,
        latest: latest ?? null,
      };
    })
  );

  return (
    <main className="mx-auto max-w-3xl w-full px-6 py-12">
      <h1 className="mb-2 text-4xl font-semibold tracking-tight">MTG Dash</h1>
      <p className="mb-10 text-sm text-zinc-500">
        Pick a league to enter.
      </p>

      {all.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No leagues yet. Run <code className="text-amber-400">npm run db:seed</code> to scaffold one.
        </p>
      ) : (
        <ul className="space-y-3">
          {counts.map((c) => (
            <li
              key={c.league.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-amber-500/60"
            >
              <Link
                href={`/leagues/${c.league.slug}`}
                className="block"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xl font-medium tracking-tight">
                    {c.league.name}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    /{c.league.slug}
                  </span>
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  {c.players} wizard{c.players === 1 ? "" : "s"} ·{" "}
                  {c.events} event{c.events === 1 ? "" : "s"}
                  {c.latest ? ` · latest: ${c.latest.name}` : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
