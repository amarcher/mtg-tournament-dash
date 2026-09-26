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
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-surface p-3 ${
        emphasized
          ? "shadow-[0_0_0_1.5px_rgb(255_215_106/0.55),0_0_32px_-8px_rgb(255_200_90/0.45)]"
          : "shadow-[0_0_0_1px_var(--color-line)]"
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

      <div className="relative z-10 flex items-center justify-between gap-2 px-1 [text-shadow:0_1px_4px_rgb(0_0_0/0.9)]">
        <span className="label-caps min-w-0 truncate text-ink">{name}</span>
        {detail && (
          <span className="label-caps shrink-0 text-ink-dim">{detail}</span>
        )}
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center [container-type:size]">
        <button
          type="button"
          onClick={onNumberTap}
          disabled={!onNumberTap}
          aria-label={onNumberTap ? `${life} life. Show life history` : undefined}
          className="touch-manipulation select-none rounded-2xl px-2 font-display font-black leading-none tabular-nums tracking-[-0.045em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-default"
          style={{
            fontSize: "min(82cqh, 44cqw)",
            textShadow:
              "0 6px 28px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,1)",
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
      className="h-14 touch-manipulation select-none rounded-[14px] border border-white/15 bg-black/45 font-display text-lg font-bold tabular-nums text-ink backdrop-blur-md transition-colors hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 active:scale-95 active:bg-white/15"
    >
      {children}
    </button>
  );
}
