/**
 * Who may act as a wizard, the pure half. A wizard is either owned by one
 * account or unowned (a guest the organizer runs, or one that predates
 * accounts). An owned wizard answers to its owner's session only; what
 * happens to an unowned one is the league's claim policy. No I/O, so it is
 * unit-tested; actions.ts and auth.ts do the lookups and call in here.
 */

export const CLAIM_POLICIES = ["anyone", "members", "organizer"] as const;
export type ClaimPolicy = (typeof CLAIM_POLICIES)[number];

export function parseClaimPolicy(raw: string | null | undefined): ClaimPolicy {
  return (CLAIM_POLICIES as readonly string[]).includes(raw ?? "")
    ? (raw as ClaimPolicy)
    : "anyone";
}

export const CLAIM_POLICY_LABELS: Record<
  ClaimPolicy,
  { title: string; detail: string }
> = {
  anyone: {
    title: "Anyone can tap a wizard",
    detail:
      "No sign-in. Whoever taps an unowned wizard plays as it on that phone.",
  },
  members: {
    title: "Signed-in members take their wizard",
    detail:
      "Tapping an unowned wizard needs a sign-in and makes it that account's for good. Use this while everyone claims theirs.",
  },
  organizer: {
    title: "Unowned wizards are guests",
    detail:
      "Nobody can take an unowned wizard. New members sign in and create their own; you run the guests.",
  },
};

export type ClaimRefusal =
  /** Not signed in, and signing in could let this through. */
  | "sign_in"
  /** Another account owns this wizard. */
  | "taken"
  /** The caller's account already owns a different wizard in this league. */
  | "has_wizard"
  /** An unowned wizard in a league where only the organizer hands them out. */
  | "guest";

export type ClaimDecision =
  | { ok: true; takeOwnership: boolean }
  | { ok: false; reason: ClaimRefusal };

/** May this visitor act as an existing wizard, and does the tap make it theirs? */
export function claimDecision(input: {
  policy: ClaimPolicy;
  /** The wizard being tapped. */
  playerId: string;
  ownerUserId: string | null;
  sessionUserId: string | null;
  /** The wizard this account already owns in the league, if any. */
  ownedPlayerId: string | null;
}): ClaimDecision {
  const { policy, ownerUserId, sessionUserId } = input;
  if (ownerUserId) {
    if (!sessionUserId) return { ok: false, reason: "sign_in" };
    return ownerUserId === sessionUserId
      ? { ok: true, takeOwnership: false }
      : { ok: false, reason: "taken" };
  }
  if (policy === "anyone") return { ok: true, takeOwnership: false };
  if (policy === "organizer") return { ok: false, reason: "guest" };
  if (!sessionUserId) return { ok: false, reason: "sign_in" };
  if (input.ownedPlayerId && input.ownedPlayerId !== input.playerId) {
    return { ok: false, reason: "has_wizard" };
  }
  return { ok: true, takeOwnership: true };
}

export type CreateDecision =
  | { ok: true; owned: boolean }
  | { ok: false; reason: "sign_in" | "has_wizard" };

/** May this visitor create a wizard for themselves, and will their account own it? */
export function createDecision(input: {
  policy: ClaimPolicy;
  sessionUserId: string | null;
  ownedPlayerId: string | null;
}): CreateDecision {
  if (input.policy === "anyone") return { ok: true, owned: false };
  if (!input.sessionUserId) return { ok: false, reason: "sign_in" };
  if (input.ownedPlayerId) return { ok: false, reason: "has_wizard" };
  return { ok: true, owned: true };
}

/**
 * Whether a cookie (or a join / resume link) for this wizard still counts.
 * An unowned wizard is whoever holds the token; an owned one also needs its
 * owner's session, which is what stops a stale phone playing as someone else.
 */
export function ownerAllows(
  ownerUserId: string | null,
  sessionUserId: string | null
): boolean {
  return ownerUserId === null || ownerUserId === sessionUserId;
}

export const CLAIM_REFUSAL_MESSAGES: Record<ClaimRefusal, string> = {
  sign_in: "Sign in to take this wizard.",
  taken: "This wizard belongs to another account.",
  has_wizard:
    "Your account already has a wizard in this league. Ask the organizer to release it if it's the wrong one.",
  guest: "This is a guest wizard. Ask the organizer to hand it to you.",
};

/**
 * How a wizard's card reads on a claim grid: the corner label, and whether
 * a tap can go anywhere. A signed-out tap on a card that needs an account
 * stays live, since the action sends it through sign-in and back.
 */
export function claimCard(decision: ClaimDecision): {
  label: string | null;
  locked: boolean;
} {
  if (decision.ok) return { label: null, locked: false };
  switch (decision.reason) {
    case "sign_in":
      return { label: "Sign in", locked: false };
    case "taken":
      return { label: "Taken", locked: true };
    case "guest":
      return { label: "Guest", locked: true };
    case "has_wizard":
      return { label: null, locked: true };
  }
}
