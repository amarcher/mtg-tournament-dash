export type OrganizerAccessInput = {
  /**
   * False only when running outside an HTTP request (the verify script drives
   * server actions in-process). Server actions invoked over the network always
   * execute inside a request scope, so this branch is unreachable externally.
   */
  hasRequestScope: boolean;
  sessionUserId: string | null;
  ownerUserId: string | null;
  membershipRole: "owner" | "organizer" | null;
  cookieOrganizerToken: string | null;
  /** Null when the league never minted one (seed/verify inserts). */
  leagueOrganizerToken: string | null;
};

export function evaluateOrganizerAccess(i: OrganizerAccessInput): boolean {
  if (!i.hasRequestScope) return true;
  if (i.sessionUserId !== null) {
    if (i.ownerUserId !== null && i.sessionUserId === i.ownerUserId) return true;
    if (i.membershipRole !== null) return true;
  }
  return (
    i.leagueOrganizerToken !== null &&
    i.cookieOrganizerToken === i.leagueOrganizerToken
  );
}
