import Link from "next/link";
import { db } from "@/db/client";
import { events, players } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { listLeaguesByIds, listLeaguesForUser } from "@/db/queries";
import { listCookieLeagueIds } from "@/lib/auth";
import { getSessionUser } from "@/lib/authz";
import type { League } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, cookieLeagueIds] = await Promise.all([
    getSessionUser(),
    listCookieLeagueIds(),
  ]);

  // Leagues are unlisted — the front door only shows leagues this visitor
  // already belongs to: managed via account, or played in via guest cookie.
  const managed = user ? await listLeaguesForUser(user.id) : [];
  const managedIds = new Set(managed.map((l) => l.id));
  const playedIn = (await listLeaguesByIds(cookieLeagueIds)).filter(
    (l) => !managedIds.has(l.id)
  );

  const hasLeagues = managed.length > 0 || playedIn.length > 0;

  return (
    <main className="mx-auto max-w-3xl w-full px-6 py-12">
      <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-semibold tracking-tight">
            MTG Dash
          </h1>
          <p className="max-w-md text-sm text-zinc-500">
            Run Magic: The Gathering nights with your friends — Swiss
            pairings, phone scorekeepers, a broadcast view for the TV, and
            AI wizard portraits for every player.
          </p>
        </div>
        <div className="flex gap-2">
          {user ? (
            <Link
              href="/leagues/new"
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              New league
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
              >
                Sign in
              </Link>
              <Link
                href="/leagues/new"
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
              >
                Create your league
              </Link>
            </>
          )}
        </div>
      </div>

      {!hasLeagues && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <h2 className="text-lg font-medium text-zinc-200">
            How it works
          </h2>
          <ol className="mt-4 space-y-3 text-sm text-zinc-400">
            <li>
              <span className="font-semibold text-amber-400">1.</span> Create
              a league — it&apos;s unlisted; sharing the link is the invite.
            </li>
            <li>
              <span className="font-semibold text-amber-400">2.</span> Friends
              scan a QR, type their name, and get a wizard portrait from a
              selfie. No accounts, no passwords.
            </li>
            <li>
              <span className="font-semibold text-amber-400">3.</span> Start
              an event: Swiss pairings, life tracking on phones, standings on
              the TV, ELO across the season.
            </li>
          </ol>
          <p className="mt-6 text-xs text-zinc-500">
            Played before? Open the league link your host shared — your
            wizard is waiting there.
          </p>
        </div>
      )}

      {managed.length > 0 && (
        <LeagueSection title="Leagues you manage" leagues={managed} withStats />
      )}
      {playedIn.length > 0 && (
        <LeagueSection title="Leagues you play in" leagues={playedIn} />
      )}
    </main>
  );
}

async function LeagueSection({
  title,
  leagues: rows,
  withStats = false,
}: {
  title: string;
  leagues: League[];
  withStats?: boolean;
}) {
  const counts = withStats
    ? await Promise.all(
        rows.map(async (l) => {
          const [playerCount] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(players)
            .where(eq(players.leagueId, l.id));
          const [eventCount] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(events)
            .where(eq(events.leagueId, l.id));
          const [latest] = await db
            .select({ name: events.name })
            .from(events)
            .where(eq(events.leagueId, l.id))
            .orderBy(desc(events.createdAt))
            .limit(1);
          return {
            players: playerCount?.n ?? 0,
            events: eventCount?.n ?? 0,
            latest: latest?.name ?? null,
          };
        })
      )
    : null;

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
        {title}
      </h2>
      <ul className="space-y-3">
        {rows.map((l, i) => (
          <li
            key={l.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-amber-500/60"
          >
            <Link href={`/leagues/${l.slug}`} className="block">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xl font-medium tracking-tight">
                  {l.name}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  /{l.slug}
                </span>
              </div>
              {counts && (
                <div className="mt-2 text-xs text-zinc-500">
                  {counts[i].players} wizard{counts[i].players === 1 ? "" : "s"}{" "}
                  · {counts[i].events} event{counts[i].events === 1 ? "" : "s"}
                  {counts[i].latest ? ` · latest: ${counts[i].latest}` : ""}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
