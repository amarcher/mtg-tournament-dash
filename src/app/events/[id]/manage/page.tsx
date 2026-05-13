import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEvent,
  getEventRoster,
  getEventRounds,
  getLeague,
  getPendingRound,
  getRoundMatches,
  getEventStandings,
} from "@/db/queries";
import {
  addManualPairingAction,
  cancelPendingRoundAction,
  completeRoundAction,
  confirmRoundAction,
  dropPendingMatchAction,
  previewNextRoundAction,
  regeneratePendingPairingsAction,
  setMatchResultAction,
  swapMatchPlayersAction,
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

  const [league, roster, rounds, standings, pendingRound] = await Promise.all([
    getLeague(event.leagueId),
    getEventRoster(id),
    getEventRounds(id),
    getEventStandings(id),
    getPendingRound(id),
  ]);

  const pendingMatches = pendingRound
    ? await getRoundMatches(pendingRound.id)
    : [];
  const pairedIds = new Set<string>();
  for (const { match } of pendingMatches) {
    pairedIds.add(match.playerAId);
    if (match.playerBId) pairedIds.add(match.playerBId);
  }
  const unpaired = pendingRound
    ? roster.filter((p) => !pairedIds.has(p.playerId))
    : [];

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
  const completedRoundsCount = rounds.filter(
    (r) => r.status === "complete"
  ).length;
  const roundsRemaining =
    event.totalRounds -
    (completedRoundsCount + (activeRound ? 1 : 0) + (pendingRound ? 1 : 0));

  const previewNext = async () => {
    "use server";
    await previewNextRoundAction(id);
  };
  const confirmPending = async () => {
    "use server";
    await confirmRoundAction(id);
  };
  const cancelPending = async () => {
    "use server";
    await cancelPendingRoundAction(id);
  };
  const regeneratePending = async () => {
    "use server";
    await regeneratePendingPairingsAction(id);
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
        {!pendingRound && roundsRemaining > 0 && (
          <form action={previewNext}>
            <button
              type="submit"
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
            >
              Preview round {completedRoundsCount + (activeRound ? 1 : 0) + 1}
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

      {pendingRound && (
        <section className="mb-10 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">
              Round {pendingRound.roundNumber} — review pairings
            </h2>
            <div className="flex flex-wrap gap-2">
              <form action={regeneratePending}>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                >
                  Re-roll auto pairings
                </button>
              </form>
              <form action={cancelPending}>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel preview
                </button>
              </form>
              <form action={confirmPending}>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                >
                  Confirm and start →
                </button>
              </form>
            </div>
          </div>
          <p className="mb-3 text-xs text-amber-200/70">
            Players won&apos;t see this round until you confirm. Swap players
            between tables, drop a pair that doesn&apos;t want to play (they
            keep their current match open on their phone), or add a manual
            pairing.
          </p>

          <ul className="space-y-2">
            {pendingMatches.map(({ match, playerA, playerB }) => (
              <li
                key={match.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/30 bg-zinc-900 p-3"
              >
                <span className="font-mono text-xs text-zinc-500">
                  T{match.tableNumber}
                </span>
                <SwapPicker
                  label={playerA.displayName}
                  matchId={match.id}
                  side="a"
                  pendingMatches={pendingMatches}
                  unpaired={unpaired}
                />
                <span className="text-zinc-500">vs</span>
                <SwapPicker
                  label={playerB?.displayName ?? "BYE"}
                  matchId={match.id}
                  side="b"
                  pendingMatches={pendingMatches}
                  unpaired={unpaired}
                  isBye={playerB === null}
                />
                <form
                  action={async () => {
                    "use server";
                    await dropPendingMatchAction({ matchId: match.id });
                  }}
                  className="ml-auto"
                >
                  <button
                    type="submit"
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20"
                    title="Excuse this pair from the round — their previous match stays playable"
                  >
                    Drop pair
                  </button>
                </form>
              </li>
            ))}
          </ul>

          {unpaired.length > 0 && (
            <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Unpaired this round ({unpaired.length})
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {unpaired.map((p) => (
                  <span
                    key={p.playerId}
                    className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-300"
                  >
                    {p.displayName}
                  </span>
                ))}
              </div>
              {unpaired.length >= 1 && (
                <form
                  action={async (fd) => {
                    "use server";
                    const playerAId = String(fd.get("playerAId") ?? "");
                    const playerBId = String(fd.get("playerBId") ?? "");
                    await addManualPairingAction({
                      roundId: pendingRound.id,
                      playerAId,
                      playerBId: playerBId || null,
                    });
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <select
                    name="playerAId"
                    required
                    defaultValue=""
                    className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs"
                  >
                    <option value="" disabled>
                      Player A
                    </option>
                    {unpaired.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">vs</span>
                  <select
                    name="playerBId"
                    defaultValue=""
                    className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs"
                  >
                    <option value="">(bye)</option>
                    {unpaired.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                  >
                    Add pairing
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      )}

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

type PendingMatchRow = {
  match: {
    id: string;
    tableNumber: number;
    playerAId: string;
    playerBId: string | null;
  };
  playerA: { id: string; displayName: string };
  playerB: { id: string; displayName: string } | null;
};

/**
 * Lets the organizer swap the player on a given side of a pending match with
 * any other player from any other pending match in the round. The select
 * options enumerate every other slot using the format "T1 · Alice (A)" so the
 * destination is unambiguous. Submitting picks a side from each match and
 * calls `swapMatchPlayersAction` to atomically swap.
 */
function SwapPicker({
  label,
  matchId,
  side,
  pendingMatches,
  unpaired,
  isBye,
}: {
  label: string;
  matchId: string;
  side: "a" | "b";
  pendingMatches: PendingMatchRow[];
  unpaired: { playerId: string; displayName: string }[];
  isBye?: boolean;
}) {
  return (
    <details className="group">
      <summary
        className={`cursor-pointer rounded-md px-2 py-1 text-sm font-medium ${
          isBye
            ? "text-zinc-500 hover:bg-zinc-800"
            : "text-zinc-100 hover:bg-zinc-800"
        }`}
      >
        {label}
      </summary>
      <form
        action={async (fd) => {
          "use server";
          const target = String(fd.get("target") ?? "");
          if (!target) return;
          const [otherMatchId, otherSide] = target.split(":");
          await swapMatchPlayersAction({
            matchAId: matchId,
            sideA: side,
            matchBId: otherMatchId,
            sideB: otherSide as "a" | "b",
          });
        }}
        className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-2"
      >
        <select
          name="target"
          required
          defaultValue=""
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
        >
          <option value="" disabled>
            Swap with…
          </option>
          {pendingMatches.flatMap((row) => {
            const opts: React.ReactElement[] = [];
            if (!(row.match.id === matchId && side === "a")) {
              opts.push(
                <option key={`${row.match.id}:a`} value={`${row.match.id}:a`}>
                  T{row.match.tableNumber} · {row.playerA.displayName}
                </option>
              );
            }
            if (
              row.match.playerBId !== null &&
              !(row.match.id === matchId && side === "b")
            ) {
              opts.push(
                <option key={`${row.match.id}:b`} value={`${row.match.id}:b`}>
                  T{row.match.tableNumber} · {row.playerB?.displayName ?? "?"}
                </option>
              );
            }
            return opts;
          })}
        </select>
        <button
          type="submit"
          className="rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium hover:bg-zinc-700"
        >
          Swap
        </button>
        {unpaired.length > 0 && (
          <span className="text-[0.65rem] text-zinc-500">
            (use the unpaired list below to bring in {unpaired[0].displayName})
          </span>
        )}
      </form>
    </details>
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
