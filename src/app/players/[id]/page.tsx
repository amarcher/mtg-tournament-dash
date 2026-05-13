import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, or, and, desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { eloChanges, events, matches, players, rounds } from "@/db/schema";
import {
  getLeague,
  getPlayer,
  listOpenEventsForPlayer,
} from "@/db/queries";
import { WizardForm } from "./WizardForm";
import { WizardGallery } from "./WizardGallery";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await getPlayer(id);
  if (!player) notFound();
  const league = await getLeague(player.leagueId);
  const openEvents = await listOpenEventsForPlayer(player.leagueId, player.id);

  const myMatches = await db
    .select({
      match: matches,
      round: rounds,
      event: events,
    })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .innerJoin(events, eq(events.id, rounds.eventId))
    .where(
      and(
        or(eq(matches.playerAId, id), eq(matches.playerBId, id)),
        eq(matches.status, "complete")
      )
    )
    .orderBy(desc(matches.completedAt));

  const opponentIds = Array.from(
    new Set(
      myMatches
        .map((m) =>
          m.match.playerAId === id ? m.match.playerBId : m.match.playerAId
        )
        .filter((x): x is string => x !== null)
    )
  );
  const opponents = opponentIds.length
    ? await db.select().from(players).where(inArray(players.id, opponentIds))
    : [];
  const oppMap = new Map(opponents.map((p) => [p.id, p]));

  let wins = 0;
  let losses = 0;
  for (const m of myMatches) {
    if (m.match.winnerId === id) wins++;
    else if (m.match.winnerId !== null) losses++;
  }

  const elo = await db
    .select()
    .from(eloChanges)
    .where(eq(eloChanges.playerId, id))
    .orderBy(desc(eloChanges.createdAt))
    .limit(20);

  return (
    <main className="mx-auto max-w-3xl w-full px-6 py-12">
      <div className="mb-8">
        <Link
          href={league ? `/leagues/${league.slug}` : "/"}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← {league?.name ?? "Home"}
        </Link>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {player.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.avatarUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-amber-500/50"
              />
            ) : (
              <div className="h-20 w-20 shrink-0 rounded-full border border-dashed border-zinc-700 bg-zinc-900" />
            )}
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {player.displayName}
              </h1>
              {player.wizardArchetype && (
                <div className="mt-0.5 text-xs uppercase tracking-[0.2em] text-amber-400/80">
                  {player.wizardArchetype}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl">{player.currentElo}</div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              ELO
            </div>
          </div>
        </div>
      </div>

      {openEvents.length > 0 && (
        <section className="mb-8 space-y-2">
          {openEvents.map(({ event, activeMatch }) => (
            <Link
              key={event.id}
              href={`/events/${event.id}/play`}
              className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 transition hover:border-amber-500 hover:bg-amber-500/20"
            >
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
                  {activeMatch ? "Your match is live" : "Tournament open"}
                </div>
                <div className="mt-0.5 truncate text-lg font-semibold text-amber-100">
                  {event.name}
                </div>
                <div className="text-xs text-amber-200/70">
                  {activeMatch
                    ? "Tap to open the scorekeeper"
                    : "Waiting for the next round — tap to stand by"}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950">
                ▶ Scorekeeper
              </span>
            </Link>
          ))}
        </section>
      )}

      <section className="mb-10 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">
          {player.avatarUrl ? "Re-wizardize" : "Wizardize"}
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Upload a selfie (iPhone HEIC works) and pick an archetype. We&apos;ll
          generate a fantasy portrait that becomes your avatar and the
          backdrop of your life-total cell on the broadcast view.
        </p>
        <WizardForm
          playerId={player.id}
          hasWizard={Boolean(player.avatarUrl)}
          defaultArchetype={player.wizardArchetype}
          generating={Boolean(player.wizardJobStartedAt)}
        />
        <WizardGallery
          selfieUrl={player.selfieUrl}
          freshUrl={player.avatarUrl}
          woundedUrl={player.avatarWoundedUrl}
          criticalUrl={player.avatarCriticalUrl}
          victoryUrl={player.avatarVictoryUrl}
          defeatUrl={player.avatarDefeatUrl}
        />
      </section>

      <section className="mb-10 grid grid-cols-3 gap-3">
        <Stat label="Wins" value={wins} />
        <Stat label="Losses" value={losses} />
        <Stat
          label="Win rate"
          value={
            wins + losses > 0
              ? `${Math.round((wins / (wins + losses)) * 100)}%`
              : "—"
          }
        />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Recent matches
        </h2>
        {myMatches.length === 0 ? (
          <p className="text-sm text-zinc-500">No completed matches.</p>
        ) : (
          <ul className="space-y-1">
            {myMatches.slice(0, 20).map(({ match, round, event }) => {
              const oppId =
                match.playerAId === id ? match.playerBId : match.playerAId;
              const opp = oppId ? oppMap.get(oppId) : null;
              const won = match.winnerId === id;
              const isBye = oppId === null;
              return (
                <li
                  key={match.id}
                  className="flex items-baseline justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2"
                >
                  <span>
                    <span
                      className={`mr-2 font-mono text-xs uppercase ${
                        won ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {isBye ? "BYE" : won ? "W" : "L"}
                    </span>
                    vs <strong>{opp?.displayName ?? "(bye)"}</strong>
                  </span>
                  <span className="text-xs text-zinc-500">
                    {event.name} · R{round.roundNumber}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
          ELO history
        </h2>
        {elo.length === 0 ? (
          <p className="text-sm text-zinc-500">No rated matches yet.</p>
        ) : (
          <ul className="space-y-1">
            {elo.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline justify-between rounded-md bg-zinc-900/30 px-4 py-1.5 text-sm"
              >
                <span className="font-mono text-zinc-500">
                  {e.before} → {e.after}
                </span>
                <span
                  className={`font-mono ${
                    e.delta >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {e.delta >= 0 ? "+" : ""}
                  {e.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center">
      <div className="font-mono text-2xl">{value}</div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
    </div>
  );
}
