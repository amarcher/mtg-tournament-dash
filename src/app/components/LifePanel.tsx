"use client";

import type { Player } from "@/db/schema";
import {
  resolveTierUrl,
  tierForLife,
  type AvatarTiers,
  type WizardTier,
} from "@/lib/avatar-tier";

/** The tiers a life total can cross into mid-game — victory/defeat are
 * end-of-match only and never rendered by this panel. */
const IN_PLAY_TIERS: WizardTier[] = ["fresh", "wounded", "critical"];

export function avatarsFor(p: Player | null): AvatarTiers {
  return {
    fresh: p?.avatarUrl ?? null,
    wounded: p?.avatarWoundedUrl ?? null,
    critical: p?.avatarCriticalUrl ?? null,
    victory: p?.avatarVictoryUrl ?? null,
    defeat: p?.avatarDefeatUrl ?? null,
  };
}

export function LifePanel({
  label,
  life,
  startingLife,
  avatars,
  onAdjust,
  emphasized,
}: {
  label: string;
  life: number;
  startingLife: number;
  avatars: AvatarTiers;
  onAdjust: (delta: number) => void;
  emphasized?: boolean;
}) {
  const activeTier = tierForLife(life, startingLife);
  // Every tier this panel can switch to is mounted at once and crossed-faded
  // by opacity. Swapping a single `src` re-decodes on each crossing, which
  // flashes the bare panel during fast life taps — worst on the first crossing,
  // when the new tier isn't in the image cache yet.
  // Deduped, because the cascade collapses tiers onto one URL for players who
  // only ever uploaded a single portrait.
  const layers = [
    ...new Map(
      IN_PLAY_TIERS.map((tier) => [resolveTierUrl(tier, avatars), tier]).filter(
        ([url]) => url !== null
      ) as [string, WizardTier][]
    ),
  ].map(([url, tier]) => ({ url, tier }));
  const hasArt = layers.length > 0;
  const activeUrl = resolveTierUrl(activeTier, avatars);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 text-center landscape:flex landscape:min-w-0 landscape:flex-1 landscape:flex-col landscape:justify-center ${
        emphasized
          ? "border-amber-500/40 bg-zinc-900"
          : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      {layers.map(({ tier, url }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={tier}
          src={url}
          alt=""
          aria-hidden
          decoding="sync"
          fetchPriority={url === activeUrl ? "high" : "low"}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            url === activeUrl ? "opacity-90" : "opacity-0"
          }`}
        />
      ))}
      {hasArt && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-black/55 to-black/90" />
      )}

      <div className="relative z-10">
        <div
          className="text-xs uppercase tracking-wide text-zinc-300"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
        >
          {label}
        </div>
        <div
          className={`my-1 font-bold tabular-nums ${
            emphasized ? "text-7xl text-white" : "text-5xl text-zinc-100"
          }`}
          style={{
            textShadow:
              "0 4px 18px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,1)",
          }}
        >
          {life}
        </div>
        {/* Deliberately never disabled while a write is in flight: taps are
            optimistic and the server's compare-and-set rejects anything stale,
            so dimming here only strobed all eight buttons during fast tapping. */}
        <div className="grid grid-cols-4 gap-2">
          <LifeButton onClick={() => onAdjust(-5)}>−5</LifeButton>
          <LifeButton onClick={() => onAdjust(-1)}>−1</LifeButton>
          <LifeButton onClick={() => onAdjust(+1)}>+1</LifeButton>
          <LifeButton onClick={() => onAdjust(+5)}>+5</LifeButton>
        </div>
      </div>
    </div>
  );
}

function LifeButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      // `transition-colors`, not `transition`: an all-property transition made
      // the active:scale-95 press lag behind fast repeated taps.
      className="touch-manipulation select-none rounded-lg bg-zinc-800 py-3 text-lg font-semibold tabular-nums transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 active:bg-zinc-600 active:scale-95"
    >
      {children}
    </button>
  );
}
