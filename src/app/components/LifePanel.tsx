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

/**
 * One player's half of the scoreboard. The portrait fills the whole panel
 * and the life total scales to whatever height the panel gets (container
 * query units), so the layout can hand panels any share of the screen without
 * the number ever clipping or leaving dead space.
 */
export function LifePanel({
  name,
  detail,
  life,
  startingLife,
  avatars,
  onAdjust,
  emphasized,
  flipped,
  onNumberTap,
  className = "",
}: {
  name: string;
  /** Right-aligned in the name row — e.g. "1 win". */
  detail?: string;
  life: number;
  startingLife: number;
  avatars: AvatarTiers;
  onAdjust: (delta: number) => void;
  emphasized?: boolean;
  /** Rotate 180° so a player across the table reads it right way up. */
  flipped?: boolean;
  /** Tapping the big number — the scorekeeper opens life history. */
  onNumberTap?: () => void;
  className?: string;
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
    <section
      aria-label={`${name}: ${life} life`}
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[14px] bg-surface p-3 ${
        // A card frame: dark outer line, a band of worn gold, and a fine
        // inner rule. The player's own panel gets the brighter gold.
        emphasized
          ? "shadow-[0_0_0_1px_#120c06,0_0_0_4px_#b58c3f,0_0_0_5px_#120c06,inset_0_0_0_1px_rgb(255_230_170/0.45)]"
          : "shadow-[0_0_0_1px_#120c06,0_0_0_4px_#5c4623,0_0_0_5px_#120c06,inset_0_0_0_1px_rgb(232_196_120/0.25)]"
      } ${flipped ? "rotate-180" : ""} ${className}`}
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
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover object-[50%_30%] transition-opacity duration-200 ${
            url === activeUrl ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div
        className={`pointer-events-none absolute inset-0 ${
          hasArt
            ? "bg-gradient-to-b from-black/35 via-black/5 to-black/75"
            : "bg-[radial-gradient(80%_70%_at_50%_35%,rgb(255_215_106/0.10),transparent_70%)]"
        }`}
      />

      {/* Nameplate, like the title bar across the top of a card. */}
      <div className="parchment relative z-10 flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5">
        <span className="min-w-0 truncate font-display text-base leading-none">
          {name}
        </span>
        {detail && (
          <span className="shrink-0 text-sm font-semibold leading-none text-[#4b3b25]">
            {detail}
          </span>
        )}
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center [container-type:size]">
        <button
          type="button"
          onClick={onNumberTap}
          disabled={!onNumberTap}
          aria-label={onNumberTap ? `${life} life. Show life history` : undefined}
          className="touch-manipulation select-none rounded-2xl px-2 font-numeral font-black leading-none tabular-nums tracking-[-0.02em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-default"
          style={{
            fontSize: "min(82cqh, 44cqw)",
            textShadow:
              "0 4px 20px rgba(0,0,0,0.9), 0 2px 0 rgba(0,0,0,0.9)",
          }}
        >
          {life}
        </button>
      </div>

      {/* Deliberately never disabled while a write is in flight: taps are
          optimistic and the server's compare-and-set rejects anything stale,
          so dimming here only strobed all eight buttons during fast tapping. */}
      <div className="relative z-10 grid grid-cols-4 gap-2">
        <LifeButton label="Lose 5 life" onClick={() => onAdjust(-5)}>
          −5
        </LifeButton>
        <LifeButton label="Lose 1 life" onClick={() => onAdjust(-1)}>
          −1
        </LifeButton>
        <LifeButton label="Gain 1 life" onClick={() => onAdjust(+1)}>
          +1
        </LifeButton>
        <LifeButton label="Gain 5 life" onClick={() => onAdjust(+5)}>
          +5
        </LifeButton>
      </div>
    </section>
  );
}

function LifeButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      // `transition-colors`, not `transition`: an all-property transition made
      // the active:scale-95 press lag behind fast repeated taps.
      className="h-14 touch-manipulation select-none rounded-[8px] border border-[rgb(232_196_120/0.35)] bg-[rgb(22_15_8/0.78)] font-numeral text-lg font-bold tabular-nums text-ink shadow-[inset_0_1px_0_rgb(255_240_210/0.08)] transition-colors hover:bg-[rgb(34_24_14/0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 active:scale-95 active:bg-white/15"
    >
      {children}
    </button>
  );
}
