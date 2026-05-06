export type AvatarTiers = {
  fresh: string | null;
  wounded: string | null;
  critical: string | null;
};

export type WizardTier = "fresh" | "wounded" | "critical";

/**
 * Map a life total to its rendering tier. >75% fresh, 25–75% wounded, ≤25% critical.
 * `startingLife <= 0` is treated as "fresh" since the ratio would be undefined.
 */
export function tierForLife(life: number, startingLife: number): WizardTier {
  if (startingLife <= 0) return "fresh";
  const ratio = life / startingLife;
  if (ratio <= 0.25) return "critical";
  if (ratio <= 0.75) return "wounded";
  return "fresh";
}

/**
 * Resolve the active avatar URL for a player at a given life total. When the
 * matching tier is missing (e.g. older single-portrait players uploaded before
 * the tiered system existed) the chain cascades critical → wounded → fresh, so
 * the cell always renders something if any portrait exists.
 */
export function pickAvatarUrl(
  life: number,
  startingLife: number,
  avatars: AvatarTiers
): string | null {
  const tier = tierForLife(life, startingLife);
  if (tier === "critical")
    return avatars.critical ?? avatars.wounded ?? avatars.fresh;
  if (tier === "wounded") return avatars.wounded ?? avatars.fresh;
  return avatars.fresh;
}
