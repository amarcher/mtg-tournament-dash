import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cookies } from "next/headers";
import { getPlayerByLeagueToken } from "@/db/queries";
import { pickMatchOutcomeAvatar, type AvatarTiers } from "@/lib/avatar-tier";

// Bundled fallback portrait — May 12 tournament winner. Used when the visitor
// hasn't claimed a wizard in any league yet, or when fetching their portrait
// fails. Read once at module load.
const FALLBACK = readFileSync(
  join(process.cwd(), "public/icons/winner-victory.jpg")
);

const LEAGUE_COOKIE_PREFIX = "mtg_league_";

// Pick the JPEG bytes to use as the app-icon source for the current request.
// If the visitor has claimed a wizard in any league, their best-available
// victory portrait wins. Otherwise, the bundled fallback. Calling this opts
// the route out of static generation (because we read cookies + the DB).
export async function getAppIconSource(): Promise<Buffer> {
  const url = await findClaimedWizardVictoryUrl();
  if (url) {
    const buf = await fetchPortrait(url);
    if (buf) return buf;
  }
  return FALLBACK;
}

async function findClaimedWizardVictoryUrl(): Promise<string | null> {
  const store = await cookies();
  for (const c of store.getAll()) {
    if (!c.name.startsWith(LEAGUE_COOKIE_PREFIX)) continue;
    const player = await getPlayerByLeagueToken(c.value).catch(() => null);
    if (!player) continue;
    const tiers: AvatarTiers = {
      fresh: player.avatarUrl,
      wounded: player.avatarWoundedUrl,
      critical: player.avatarCriticalUrl,
      victory: player.avatarVictoryUrl,
      defeat: player.avatarDefeatUrl,
    };
    const url = pickMatchOutcomeAvatar("won", tiers);
    if (url) return url;
  }
  return null;
}

async function fetchPortrait(url: string): Promise<Buffer | null> {
  try {
    const fullUrl = url.startsWith("http")
      ? url
      : `${process.env.PUBLIC_URL ?? "https://mtg.capxun.com"}${url}`;
    const res = await fetch(fullUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
