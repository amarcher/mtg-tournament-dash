"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { endBonusGameAction } from "@/app/events/actions";

export type UnfinishedBonusGameView = {
  matchId: string;
  startedLabel: string;
  opponentName: string;
  opponentAvatarUrl: string | null;
  gameNumber: number;
  myLife: number;
  theirLife: number;
  myWins: number;
  theirWins: number;
};

export function UnfinishedBonusGames({
  games,
}: {
  games: UnfinishedBonusGameView[];
}) {
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-ink">Unfinished games</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {games.map((g) => (
          <UnfinishedRow key={g.matchId} game={g} />
        ))}
      </ul>
    </div>
  );
}

function UnfinishedRow({ game: g }: { game: UnfinishedBonusGameView }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const end = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      try {
        await endBonusGameAction({ matchId: g.matchId });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't end the game");
        setConfirming(false);
      }
    });
  };

  return (
    <li className="rounded-[10px] border border-line bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-3">
        {g.opponentAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={g.opponentAvatarUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line-strong"
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-sm font-bold text-gold ring-1 ring-line-strong">
            {g.opponentName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <div>
            vs <strong className="font-semibold">{g.opponentName}</strong>
            <span className="text-ink-dim"> · {g.startedLabel}</span>
          </div>
          <div className="text-ink-dim">
            Game {g.gameNumber} ·{" "}
            <span className="font-numeral font-bold tabular-nums text-ink">
              {g.myLife}
            </span>{" "}
            to{" "}
            <span className="font-numeral font-bold tabular-nums text-ink">
              {g.theirLife}
            </span>
            {(g.myWins > 0 || g.theirWins > 0) &&
              ` · games ${g.myWins}–${g.theirWins}`}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={end}
          disabled={pending}
          className="rounded-[8px] border border-line px-3 py-1.5 text-sm font-medium text-ink-dim transition hover:border-red-400/60 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 disabled:opacity-50"
        >
          {pending ? "Ending…" : confirming ? "Tap again to end" : "End"}
        </button>
        <Link
          href={`/matches/${g.matchId}`}
          className="rounded-[8px] border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          Resume →
        </Link>
      </div>
      {error && <p className="mt-1 text-sm text-red-300">{error}</p>}
    </li>
  );
}
