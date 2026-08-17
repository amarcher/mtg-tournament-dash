import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { games, type Player } from "@/db/schema";
import { getBonusGame, getLeague } from "@/db/queries";
import { getBonusGameCallerId } from "@/lib/bonus-game";
import { pickMatchOutcomeAvatar, type AvatarTiers } from "@/lib/avatar-tier";
import { qrDataUrl } from "@/lib/qr";
import { getPublicBaseUrl } from "@/lib/public-url";
import {
  joinBonusGameAction,
  startAnotherBonusGameAction,
} from "@/app/events/actions";
import { CopyButton } from "@/app/components/CopyButton";
import { BonusPlayClient } from "./BonusPlayClient";
import { BonusGameLive, CancelBonusGameButton } from "./BonusGameLive";

export const dynamic = "force-dynamic";

function tiersFor(p: Player | null): AvatarTiers {
  return {
    fresh: p?.avatarUrl ?? null,
    wounded: p?.avatarWoundedUrl ?? null,
    critical: p?.avatarCriticalUrl ?? null,
    victory: p?.avatarVictoryUrl ?? null,
    defeat: p?.avatarDefeatUrl ?? null,
  };
}

function WizardCard({
  player,
  imageUrl,
  caption,
}: {
  player: Player;
  imageUrl?: string | null;
  caption?: string;
}) {
  const url = imageUrl ?? player.avatarUrl;
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-amber-500/60 font-mono text-2xl text-amber-400/80">
            {player.displayName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <div
        className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-6 text-center text-base font-semibold tracking-tight text-white"
        style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}
      >
        {player.displayName}
        {caption && (
          <div className="text-xs font-medium text-amber-300">{caption}</div>
        )}
      </div>
    </div>
  );
}

export default async function BonusGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getBonusGame(id);
  if (!data) notFound();
  const { match, playerA, playerB } = data;
  if (!match.leagueId) notFound();
  const league = await getLeague(match.leagueId);
  if (!league) notFound();

  const callerId = await getBonusGameCallerId(match);
  const isParticipant =
    callerId === playerA.id || (playerB !== null && callerId === playerB.id);

  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.matchId, match.id))
    .orderBy(games.gameNumber);
  const aWins = allGames.filter((g) => g.winnerId === playerA.id).length;
  const bWins = playerB
    ? allGames.filter((g) => g.winnerId === playerB.id).length
    : 0;

  const backHref = match.eventId
    ? `/events/${match.eventId}/play`
    : `/leagues/${league.slug}`;
  const backLabel = match.eventId ? "Back to the tournament" : "Back to league";

  if (match.status === "complete") {
    const aOutcome = aWins >= bWins ? "won" : "lost";
    return (
      <main className="mx-auto w-full max-w-md px-4 py-8 text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
          Bonus Game over
        </div>
        <h1 className="mt-1 text-2xl font-semibold">
          {aWins === bWins
            ? "Dead even"
            : `${aWins > bWins ? playerA.displayName : playerB?.displayName} takes it`}
        </h1>
        {playerB && (
          <div className="mt-6 grid grid-cols-2 items-center gap-3">
            <WizardCard
              player={playerA}
              imageUrl={pickMatchOutcomeAvatar(aOutcome, tiersFor(playerA))}
              caption={`${aWins} ${aWins === 1 ? "game" : "games"}`}
            />
            <WizardCard
              player={playerB}
              imageUrl={pickMatchOutcomeAvatar(
                aOutcome === "won" ? "lost" : "won",
                tiersFor(playerB)
              )}
              caption={`${bWins} ${bWins === 1 ? "game" : "games"}`}
            />
          </div>
        )}
        {isParticipant && playerB && (
          <form action={startAnotherBonusGameAction} className="mt-6">
            <input type="hidden" name="matchId" value={match.id} />
            <button
              type="submit"
              className="w-full rounded-xl bg-amber-500 py-3 font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              Bonus Game
            </button>
          </form>
        )}
        <Link
          href={backHref}
          className="mt-4 inline-block rounded-md px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          {backLabel}
        </Link>
        {isParticipant && <BonusGameLive matchId={match.id} />}
      </main>
    );
  }

  if (match.status === "pending") {
    // Unrecognized phone scanning the QR: claim a wizard first, come back.
    if (!callerId) {
      redirect(`/leagues/${league.slug}/claim?next=/matches/${match.id}`);
    }

    if (callerId === playerA.id) {
      const baseUrl = await getPublicBaseUrl();
      const joinUrl = `${baseUrl}/matches/${match.id}`;
      const qr = await qrDataUrl(joinUrl);
      return (
        <main className="mx-auto w-full max-w-md px-4 py-8 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
            Bonus Game
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            Waiting for an opponent
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Have them scan this with their phone — whoever scans it takes the
            seat across from you.
          </p>
          <div className="mx-auto mt-6 w-56 rounded-2xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code to join this bonus game" />
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-500">
            <span className="max-w-[16rem] truncate">{joinUrl}</span>
            <CopyButton value={joinUrl} />
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Starting life {match.startingLife ?? 20} · games until you quit ·
            no ELO, just glory
          </p>
          <div className="mt-6">
            <CancelBonusGameButton
              matchId={match.id}
              redirectTo={backHref}
            />
          </div>
          <BonusGameLive matchId={match.id} />
        </main>
      );
    }

    // A recognized league wizard who isn't the creator: offer the seat.
    return (
      <main className="mx-auto w-full max-w-md px-4 py-8 text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
          Bonus Game
        </div>
        <h1 className="mt-1 text-2xl font-semibold">
          {playerA.displayName} wants a game
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Starting life {match.startingLife ?? 20} · games until you quit · no
          ELO on the line.
        </p>
        <div className="mx-auto mt-6 max-w-[14rem]">
          <WizardCard player={playerA} />
        </div>
        <form action={joinBonusGameAction} className="mt-6">
          <input type="hidden" name="matchId" value={match.id} />
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            Join the game
          </button>
        </form>
        <Link
          href={`/leagues/${league.slug}/claim?switch=1&next=/matches/${match.id}`}
          className="mt-4 inline-block rounded-md px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          Not you? Switch wizard
        </Link>
        <BonusGameLive matchId={match.id} />
      </main>
    );
  }

  // In progress.
  if (!isParticipant || !playerB) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-12 text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
          Bonus Game
        </div>
        <h1 className="mt-1 text-2xl font-semibold">
          {playerA.displayName} vs {playerB?.displayName ?? "?"}
        </h1>
        <p className="mt-3 text-lg tabular-nums text-zinc-300">
          {aWins} — {bWins}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          This one&apos;s already going — grab someone and start your own.
        </p>
        <Link
          href={`/leagues/${league.slug}`}
          className="mt-4 inline-block rounded-md px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          Back to league
        </Link>
      </main>
    );
  }

  const activeGame =
    allGames.find((g) => g.winnerId === null) ?? allGames[allGames.length - 1];
  const mySide: "a" | "b" = callerId === playerA.id ? "a" : "b";

  return (
    <BonusPlayClient
      matchId={match.id}
      leagueSlug={league.slug}
      leagueName={league.name}
      eventId={match.eventId}
      mySide={mySide}
      players={{ a: playerA, b: playerB }}
      startingLife={match.startingLife ?? 20}
      initialGame={activeGame}
      initialWins={{ a: aWins, b: bWins }}
    />
  );
}
