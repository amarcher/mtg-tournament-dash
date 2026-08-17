"use client";

import type { Player } from "@/db/schema";
import { pickAvatarUrl, type AvatarTiers } from "@/lib/avatar-tier";

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
  pending,
  emphasized,
}: {
  label: string;
  life: number;
  startingLife: number;
  avatars: AvatarTiers;
  onAdjust: (delta: number) => void;
  pending: boolean;
  emphasized?: boolean;
}) {
  const bgUrl = pickAvatarUrl(life, startingLife, avatars);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 text-center landscape:flex landscape:min-w-0 landscape:flex-1 landscape:flex-col landscape:justify-center ${
        emphasized
          ? "border-amber-500/40 bg-zinc-900"
          : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      {bgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgUrl}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90"
        />
      )}
      {bgUrl && (
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
        <div className="grid grid-cols-4 gap-2">
          <LifeButton onClick={() => onAdjust(-5)} disabled={pending}>
            −5
          </LifeButton>
          <LifeButton onClick={() => onAdjust(-1)} disabled={pending}>
            −1
          </LifeButton>
          <LifeButton onClick={() => onAdjust(+1)} disabled={pending}>
            +1
          </LifeButton>
          <LifeButton onClick={() => onAdjust(+5)} disabled={pending}>
            +5
          </LifeButton>
        </div>
      </div>
    </div>
  );
}

function LifeButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-zinc-800 py-3 text-lg font-semibold tabular-nums transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 active:scale-95 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
