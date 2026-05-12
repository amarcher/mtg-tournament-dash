import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEvent,
  getEventRoster,
  getEventRounds,
  getLeague,
  getRoundMatches,
  getEventStandings,
} from "@/db/queries";
import {
  startNextRoundAction,
  completeRoundAction,
  setMatchResultAction,
} from "@/app/events/actions";
import { qrDataUrl } from "@/lib/qr";
import { getPublicBaseUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

export default async function ManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const [league, roster, rounds, standings] = await Promise.all([
    getLeague(event.leagueId),
    getEventRoster(id),
    getEventRounds(id),
    getEventStandings(id),
  ]);

  // Use the same LAN-aware base URL helper as the broadcast view so the QRs
  // here resolve to a host phones can actually reach (not localhost).
  const baseUrl = await getPublicBaseUrl();
  const rosterQrs = await Promise.all(
    roster.map((p) =>
      qrDataUrl(`${baseUrl}/events/${id}/join/${p.joinToken}`)
    )
  );

  const activeRound = rounds.find((r) => r.status === "active");
  const activeMatches = activeRound
    ? await getRoundMatches(activeRound.id)
    : [];
  const incompleteCount = activeMatches.filter(
    (r) => r.match.status !== "complete"
  ).length;

  const startNext = async () => {
    "use server";
    await startNextRoundAction(id);
  };
  const completeActive = async () => {
    "use server";
    await completeRoundAction(id);
  };

  return (
    <main className="mx-auto max-w-5xl w-full px-6 py-12">
      <div className="mb-8">
        <Link
          href={league ? `/leagues/${league.slug}` : "/"}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← {league?.name ?? "Home"}
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs uppercase tracking-wide text-zinc-400">
            {event.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {event.format} · {event.totalRounds} rounds · life {event.startingLife}
        </p>
      </div>

      <div className="mb-8 flex flex-wrap gap-3">
        <Link
          href={`/events/${id}/broadcast`}
          target="_blank"
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
        >
          Open broadcast view ↗
        </Link>
        <Link
          href={`/events/${id}/claim`}
          target="_blank"
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
        >
          Open claim page →
        </Link>
        {!activeRound && rounds.length < event.totalRounds && (
          <form action={startNext}>
            <button
              type="submit"
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
            >
              Start round {rounds.length + 1}
            </button>
          </form>
        )}
        {activeRound && (
          <form action={completeActive}>
            <button
              type="submit"
              disabled={incompleteCount > 0}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/30 disabled:text-zinc-950/60"
              title={
                incompleteCount > 0
                  ? `${incompleteCount} match(es) need a result first`
                  : ""
              }
            >
              {incompleteCount > 0
                ? `Complete round (${incompleteCount} pending)`
                : `Complete round ${activeRound.roundNumber}`}
            </button>
          </form>
        )}
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Player join links
        </h2>
        <ul className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          {roster.map((p, i) => (
            <li
              key={p.playerId}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-800"
            >
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.avatarUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <Link
                  href={`/players/${p.playerId}`}
                  title="Add wizard portrait"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-amber-500/50 text-xs text-amber-500/80 hover:bg-amber-500/10"
                >
                  +
                </Link>
              )}
              <Link
                href={`/players/${p.playerId}`}
                className="flex-1 font-medium hover:text-amber-400"
              >
                {p.displayName}
              </Link>
              <code className="select-all rounded bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-400">
                /events/{id}/join/{p.joinToken}
              </code>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rosterQrs[i]}
                alt={`QR join link for ${p.displayName}`}
                title={`${baseUrl}/events/${id}/join/${p.joinToken}`}
                className="h-12 w-12 shrink-0 rounded bg-white p-0.5"
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          Send each player their full URL — visiting it sets a cookie identifying
          them, then they go to the play page.
        </p>
      </section>

      {activeRound && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
            Round {activeRound.roundNumber} — in progress
          </h2>
          {incompleteCount > 0 && (
            <p className="mb-3 text-xs text-zinc-500">
              Pick a winner below to finalize any matches that didn&apos;t
              report through the phone view.
            </p>
          )}
          <ul className="space-y-2">
            {activeMatches.map(({ match, playerA, playerB }) => {
              const isBye = playerB === null;
              const isComplete = match.status === "complete";
              const winnerName =
                isComplete && match.winnerId
                  ? match.winnerId === playerA.id
                    ? playerA.displayName
                    : playerB?.displayName ?? null
                  : null;
              return (
                <li
                  key={match.id}
                  className={`flex flex-wrap items-center gap-3 rounded-md border p-4 ${
                    isComplete
                      ? "border-zinc-800 bg-zinc-900/60"
                      : "border-amber-500/40 bg-zinc-900"
                  }`}
                >
                  <span className="font-mono text-xs text-zinc-500">
                    T{match.tableNumber}
                  </span>
                  <span className="flex-1">
                    <strong>{playerA.displayName}</strong>{" "}
                    <span className="text-zinc-500">vs</span>{" "}
                    <strong>{playerB?.displayName ?? "BYE"}</strong>
                  </span>
                  {isComplete ? (
                    <span className="text-xs text-emerald-400">
                      {match.isDraw
                        ? "draw"
                        : winnerName
                          ? `✓ ${winnerName}`
                          : "complete"}
                    </span>
                  ) : isBye ? (
                    <span className="text-xs text-zinc-500">automatic</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <ResultButton
                        matchId={match.id}
                        outcome="a"
                        label={`${playerA.displayName} wins`}
                      />
                      <ResultButton
                        matchId={match.id}
                        outcome="b"
                        label={`${playerB!.displayName} wins`}
                      />
                      <ResultButton
                        matchId={match.id}
                        outcome="draw"
                        label="Draw"
                        variant="muted"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Standings
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2 text-right">W-L-D</th>
              <th className="px-3 py-2 text-right">Pts</th>
              <th
                className="px-3 py-2 text-right"
                title="Opponents' Match-Win Percentage — primary MTG tiebreaker"
              >
                OMW%
              </th>
              <th
                className="px-3 py-2 text-right"
                title="Game-Win Percentage — secondary MTG tiebreaker"
              >
                GW%
              </th>
              <th
                className="px-3 py-2 text-right"
                title="Opponents' Game-Win Percentage — tertiary MTG tiebreaker"
              >
                OGW%
              </th>
              <th className="px-3 py-2 text-right">ELO</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr
                key={s.playerId}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-mono text-zinc-500">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{s.displayName}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {s.wins}-{s.losses}-{s.draws}
                </td>
                <td className="px-3 py-2 text-right font-mono">{s.matchPoints}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-400">
                  {(s.opponentMatchWinPct * 100).toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-400">
                  {(s.gameWinPct * 100).toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-400">
                  {(s.opponentGameWinPct * 100).toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-400">
                  {s.currentElo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function ResultButton({
  matchId,
  outcome,
  label,
  variant,
}: {
  matchId: string;
  outcome: "a" | "b" | "draw";
  label: string;
  variant?: "muted";
}) {
  return (
    <form action={setMatchResultAction}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="outcome" value={outcome} />
      <button
        type="submit"
        className={
          variant === "muted"
            ? "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            : "rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
        }
      >
        {label}
      </button>
    </form>
  );
}
