import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEvent,
  getEventRoster,
  getEventRounds,
  getLeague,
  getMatchIdsWithRecordedGames,
  getPendingRound,
  getRoundMatches,
  getEventStandings,
  sweepStaleWizardJobs,
} from "@/db/queries";
import {
  addManualPairingAction,
  addRoundAction,
  cancelPendingRoundAction,
  completeRoundAction,
  confirmRoundAction,
  dropPendingMatchAction,
  endEventAction,
  previewNextRoundAction,
  regeneratePendingPairingsAction,
  reopenEventAction,
  revertRoundToPairingsAction,
  setMatchResultAction,
  swapActiveMatchPlayersAction,
  swapMatchPlayersAction,
} from "@/app/events/actions";
import { qrDataUrl } from "@/lib/qr";
import { getPublicBaseUrl } from "@/lib/public-url";
import { AppChrome, StatusBadge } from "@/app/components/AppChrome";
import { EventNav } from "@/app/components/EventNav";
import { CopyButton } from "@/app/components/CopyButton";
import { formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Reap stale wizardize jobs across the league before rendering the roster
  // (manage view shows every player's spinner state).
  await sweepStaleWizardJobs();
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
  const rosterJoinUrls = roster.map(
    (p) => `${baseUrl}/events/${id}/join/${p.joinToken}`
  );

  const activeRound = rounds.find((r) => r.status === "active");
  const activeMatches = activeRound
    ? await getRoundMatches(activeRound.id)
    : [];
  const incompleteCount = activeMatches.filter(
    (r) => r.match.status !== "complete"
  ).length;
  // Tables with a recorded game winner: no longer safe to re-seat or revert.
  const matchIdsWithGames = activeRound
    ? await getMatchIdsWithRecordedGames(activeRound.id)
    : [];
  const roundHasAnyResult =
    activeMatches.some(
      ({ match }) =>
        match.playerBId !== null &&
        (match.status === "complete" || match.isDraw)
    ) || matchIdsWithGames.length > 0;
  const swappableActive = activeMatches.filter(
    ({ match }) =>
      match.status === "in_progress" &&
      match.playerBId !== null &&
      !matchIdsWithGames.includes(match.id)
  );
  const completedRoundsCount = rounds.filter(
    (r) => r.status === "complete"
  ).length;
  const isComplete = event.status === "complete";
  // Rounds whose results would count if the organizer ended right now: every
  // closed round, plus the active one once its last match is reported.
  const roundsIfEndedNow =
    completedRoundsCount + (activeRound && incompleteCount === 0 ? 1 : 0);
  // Name the champion from the locked-in placements, not live standings —
  // results can still be edited after completion, and the banner must agree
  // with the finalStanding table shown below it.
  const champion =
    roster.find((p) => p.finalStanding === 1)?.displayName ??
    standings[0]?.displayName;
  const roundsRemaining =
    event.totalRounds -
    (completedRoundsCount + (activeRound ? 1 : 0) + (pendingRound ? 1 : 0));
  const currentStep = pendingRound
    ? 2
    : activeRound
      ? 3
      : roundsRemaining > 0
        ? 1
        : 5;

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
  const revertActive = async () => {
    "use server";
    await revertRoundToPairingsAction(id);
  };
  const regeneratePending = async () => {
    "use server";
    await regeneratePendingPairingsAction(id);
  };
  const completeActive = async () => {
    "use server";
    await completeRoundAction(id);
  };
  const endEvent = async () => {
    "use server";
    await endEventAction(id);
  };
  const reopenEvent = async () => {
    "use server";
    await reopenEventAction(id);
  };
  const addRound = async () => {
    "use server";
    await addRoundAction(id);
  };

  return (
    <AppChrome league={league} currentEvent={event} active="manage">
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <EventNav event={event} league={league} active="manage" />
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
              <StatusBadge status={event.status} />
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {event.format} · {event.totalRounds} rounds · life {event.startingLife}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/events/${id}/broadcast`}
              target="_blank"
              className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              Broadcast
            </Link>
            <Link
              href={`/events/${id}/claim`}
              target="_blank"
              className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              Claim page
            </Link>
          </div>
        </div>

        <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ["Share", "Join links"],
              ["Preview", "Pairings"],
              ["Run", "Round"],
              ["Close", "Results"],
              ["Finish", "Finals"],
            ].map(([label, detail], index) => {
              const step = index + 1;
              const active = step === currentStep;
              const done = step < currentStep;
              return (
                <div
                  key={label}
                  className={`rounded-md border px-3 py-2 ${
                    active
                      ? "border-amber-500/50 bg-amber-500/10"
                      : done
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-zinc-800 bg-zinc-950/50"
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Step {step}
                  </div>
                  <div
                    className={
                      active ? "font-semibold text-amber-200" : "font-medium"
                    }
                  >
                    {label}
                  </div>
                  <div className="text-xs text-zinc-500">{detail}</div>
                </div>
              );
            })}
          </div>
          {activeRound && incompleteCount > 0 && (
            <p className="mt-3 text-sm text-amber-200">
              {incompleteCount} match{incompleteCount === 1 ? "" : "es"} still{" "}
              {incompleteCount === 1 ? "needs" : "need"} a result before this
              round can close.
            </p>
          )}
        </section>

      {isComplete ? (
        <section className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">
                Tournament complete
              </h2>
              <p className="mt-1 text-sm text-zinc-300">
                {champion ? (
                  <>
                    Champion: <strong className="text-amber-200">{champion}</strong> · final
                    standings locked in after {completedRoundsCount} round
                    {completedRoundsCount === 1 ? "" : "s"}.
                  </>
                ) : (
                  "Final standings are locked in below."
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Link
                href={`/events/${id}/broadcast`}
                target="_blank"
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
              >
                View results
              </Link>
              <form action={addRound}>
                <button
                  type="submit"
                  className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                  title="Reopen the event and schedule one more round"
                >
                  Add a round
                </button>
              </form>
              <details className="group">
                <summary className="cursor-pointer list-none rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70">
                  Reopen…
                </summary>
                <div className="mt-2 w-full max-w-md rounded-md border border-zinc-700 bg-zinc-950 p-3">
                  <p className="mb-3 text-xs text-zinc-400">
                    Unlock final standings and set the event back to in-progress
                    so you can play more rounds or re-end it. Match results and
                    ELO are kept.
                  </p>
                  <form action={reopenEvent}>
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                    >
                      Reopen event
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </div>
        </section>
      ) : (
        <div className="mb-8 flex flex-wrap items-start gap-3">
          {!pendingRound && roundsRemaining > 0 && (
            <div>
              <form action={previewNext}>
                <button
                  type="submit"
                  className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                >
                  Preview round{" "}
                  {completedRoundsCount + (activeRound ? 1 : 0) + 1}
                </button>
              </form>
              {activeRound && incompleteCount > 0 && (
                <p className="mt-2 max-w-xs text-xs text-amber-200">
                  {incompleteCount} table{incompleteCount === 1 ? "" : "s"}{" "}
                  haven&apos;t reported yet — pairings previewed now won&apos;t
                  see those results. Waiting on them (or re-rolling once
                  they&apos;re in) gives better matchups.
                </p>
              )}
            </div>
          )}
          {activeRound && (
            <form action={completeActive}>
              <button
                type="submit"
                disabled={incompleteCount > 0}
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 disabled:cursor-not-allowed disabled:bg-emerald-500/30 disabled:text-zinc-950/60"
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
          {activeRound && !roundHasAnyResult && !pendingRound && (
            <details className="group">
              <summary className="cursor-pointer list-none rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70">
                Un-start round…
              </summary>
              <div className="mt-2 w-full max-w-md rounded-md border border-zinc-700 bg-zinc-950 p-3">
                <p className="mb-3 text-xs text-zinc-400">
                  Retract round {activeRound.roundNumber} and go back to the
                  review-pairings screen — swap, drop, or re-roll, then confirm
                  again. Players&apos; phones return to the waiting room. Any
                  life taps this round are discarded. Unavailable once a result
                  is reported.
                </p>
                <form action={revertActive}>
                  <button
                    type="submit"
                    className="rounded-md bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                  >
                    Back to pairings
                  </button>
                </form>
              </div>
            </details>
          )}
          {(completedRoundsCount >= 1 || activeRound) && (
            <details className="group">
              <summary className="cursor-pointer list-none rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70">
                End event early…
              </summary>
              <div className="mt-2 w-full max-w-md rounded-md border border-red-500/30 bg-zinc-950 p-3">
                {activeRound && incompleteCount > 0 ? (
                  <p className="text-xs text-amber-200">
                    Report the {incompleteCount} pending match
                    {incompleteCount === 1 ? "" : "es"} in round{" "}
                    {activeRound.roundNumber} before ending the event.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-zinc-400">
                      Finish the tournament now and tabulate the winner from the{" "}
                      {roundsIfEndedNow} round{roundsIfEndedNow === 1 ? "" : "s"}{" "}
                      played so far. Final standings get locked in and this
                      can&apos;t be undone.
                    </p>
                    <form action={endEvent}>
                      <button
                        type="submit"
                        className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
                      >
                        End event &amp; tabulate winner
                      </button>
                    </form>
                  </>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
              Player join links
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Share a direct link or QR with each player. The link identifies them and opens the scorekeeper.
            </p>
          </div>
          <Link
            href={`/events/${id}/claim`}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Open shared claim grid
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {roster.map((p, i) => (
            <li
              key={p.playerId}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="flex items-center gap-3">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <Link
                    href={`/players/${p.playerId}`}
                    title="Add wizard portrait"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-amber-500/50 text-xs text-amber-500/80 transition hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                  >
                    +
                  </Link>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/players/${p.playerId}`}
                    className="font-medium transition hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                  >
                    {p.displayName}
                  </Link>
                  <code className="mt-1 hidden truncate rounded bg-zinc-950 px-2 py-1 font-mono text-[0.65rem] text-zinc-500 sm:block">
                    {rosterJoinUrls[i]}
                  </code>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={rosterQrs[i]}
                  alt={`QR join link for ${p.displayName}`}
                  title={rosterJoinUrls[i]}
                  className="h-14 w-14 shrink-0 rounded bg-white p-0.5"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton value={rosterJoinUrls[i]} />
                <Link
                  href={`/events/${id}/join/${p.joinToken}`}
                  className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
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
          {activeRound && incompleteCount > 0 && (
            <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200">
              {incompleteCount} table{incompleteCount === 1 ? "" : "s"} in round{" "}
              {activeRound.roundNumber} still {incompleteCount === 1 ? "hasn't" : "haven't"}{" "}
              reported — these pairings don&apos;t reflect those results.
              Re-roll once they&apos;re in (unless you&apos;re excusing that
              pair from this round).
            </p>
          )}
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
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
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
              {swappableActive.length >= 2 && (
                <>
                  {" "}
                  Wrong seats? Tap a player&apos;s name to swap them with
                  someone from another table — possible until a result is
                  recorded.
                </>
              )}
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
                  {swappableActive.length >= 2 &&
                  swappableActive.some((s) => s.match.id === match.id) ? (
                    <span className="flex flex-1 flex-wrap items-center gap-1">
                      <ActiveSwapPicker
                        label={playerA.displayName}
                        matchId={match.id}
                        side="a"
                        swappable={swappableActive}
                      />
                      <span className="text-zinc-500">vs</span>
                      <ActiveSwapPicker
                        label={playerB!.displayName}
                        matchId={match.id}
                        side="b"
                        swappable={swappableActive}
                      />
                    </span>
                  ) : (
                    <span className="flex-1">
                      <strong>{playerA.displayName}</strong>{" "}
                      <span className="text-zinc-500">vs</span>{" "}
                      <strong>{playerB?.displayName ?? "BYE"}</strong>
                    </span>
                  )}
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
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
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
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-zinc-900/70 text-left text-xs uppercase tracking-wide text-zinc-500">
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
                    {formatPct(s.opponentMatchWinPct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {formatPct(s.gameWinPct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {formatPct(s.opponentGameWinPct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {s.currentElo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </main>
    </AppChrome>
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
 * Same interaction as SwapPicker, but for a round that is already running:
 * swap this seat with a seat at another still-virgin table (no recorded
 * results). Calls `swapActiveMatchPlayersAction`, which also resets both
 * tables' life totals and broadcasts a reload to every phone.
 */
function ActiveSwapPicker({
  label,
  matchId,
  side,
  swappable,
}: {
  label: string;
  matchId: string;
  side: "a" | "b";
  swappable: PendingMatchRow[];
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-zinc-100 hover:bg-zinc-800">
        {label}
      </summary>
      <form
        action={async (fd) => {
          "use server";
          const target = String(fd.get("target") ?? "");
          if (!target) return;
          const [otherMatchId, otherSide] = target.split(":");
          await swapActiveMatchPlayersAction({
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
          {swappable
            .filter((row) => row.match.id !== matchId)
            .flatMap((row) => [
              <option key={`${row.match.id}:a`} value={`${row.match.id}:a`}>
                T{row.match.tableNumber} · {row.playerA.displayName}
              </option>,
              <option key={`${row.match.id}:b`} value={`${row.match.id}:b`}>
                T{row.match.tableNumber} · {row.playerB!.displayName}
              </option>,
            ])}
        </select>
        <button
          type="submit"
          className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
        >
          Swap
        </button>
      </form>
    </details>
  );
}

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
          className="rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
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
            ? "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 sm:w-auto"
            : "w-full rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 sm:w-auto"
        }
      >
        {label}
      </button>
    </form>
  );
}
