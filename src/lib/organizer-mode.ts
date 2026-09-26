import { cookies } from "next/headers";
import { isLeagueOrganizer } from "@/lib/authz";
import type { League } from "@/db/schema";

/**
 * Organizer mode is a *view* preference, not a permission. An organizer with
 * it off sees exactly the player app (the tidy default for a night they're
 * just playing); with it on, organizer affordances appear — the Organize tab,
 * the scorekeeper's Organize chip, Manage buttons, planning forms. Every
 * organizer action still authorizes through src/lib/authz.ts on its own.
 */
export const ORGANIZER_MODE_COOKIE = "mtg_organizer_mode";

export async function readOrganizerModeCookie(): Promise<boolean> {
  try {
    const store = await cookies();
    return store.get(ORGANIZER_MODE_COOKIE)?.value === "1";
  } catch {
    return false;
  }
}

export async function getOrganizerView(
  league: League | string | null | undefined
): Promise<{ isOrganizer: boolean; organizerMode: boolean }> {
  if (!league) return { isOrganizer: false, organizerMode: false };
  const [isOrganizer, modeOn] = await Promise.all([
    isLeagueOrganizer(league),
    readOrganizerModeCookie(),
  ]);
  return { isOrganizer, organizerMode: isOrganizer && modeOn };
}
