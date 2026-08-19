export type AvatarTiers = {
  fresh: string | null;
  wounded: string | null;
  critical: string | null;
  victory: string | null;
  defeat: string | null;
};

export type WizardTier =
  | "fresh"
  | "wounded"
  | "critical"
  | "victory"
  | "defeat";

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
 * Resolve one in-play tier to a URL, cascading critical → wounded → fresh when
 * the exact tier is missing (e.g. older single-portrait players uploaded before
 * the tiered system existed), so the cell always renders something if any
 * portrait exists.
 */
export function resolveTierUrl(
  tier: WizardTier,
  avatars: AvatarTiers
): string | null {
  if (tier === "victory") return avatars.victory ?? avatars.fresh;
  if (tier === "defeat")
    return avatars.defeat ?? avatars.critical ?? avatars.wounded ?? avatars.fresh;
  if (tier === "critical")
    return avatars.critical ?? avatars.wounded ?? avatars.fresh;
  if (tier === "wounded") return avatars.wounded ?? avatars.fresh;
  return avatars.fresh;
}

/**
 * Resolve the active avatar URL for a player at a given life total.
 */
export function pickAvatarUrl(
  life: number,
  startingLife: number,
  avatars: AvatarTiers
): string | null {
  return resolveTierUrl(tierForLife(life, startingLife), avatars);
}

/**
 * Pick a match-outcome portrait once a match is complete. Victory falls back
 * to fresh, defeat falls back to critical → wounded → fresh.
 */
export function pickMatchOutcomeAvatar(
  outcome: "won" | "lost",
  avatars: AvatarTiers
): string | null {
  return resolveTierUrl(outcome === "won" ? "victory" : "defeat", avatars);
}
