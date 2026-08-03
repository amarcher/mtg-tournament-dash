import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { playerPortraits, players } from "@/db/schema";
import { generateWizardVariantsFromSelfie } from "@/lib/wizard";
import {
  PORTRAIT_THEME_LABELS,
  type PortraitTheme,
} from "@/lib/wizard-types";

/**
 * Domain core for wizard-portrait generation, deliberately un-authorized:
 * `generateWizardAction` wraps it with the league-cookie check, while trusted
 * server callers (the verify harness) drive it directly. Mirrors the
 * match-mutations.ts split. Not `import "server-only"` — that throws under
 * tsx and breaks verify.
 */

// `after()` extends the Vercel function lifetime past the response, but it
// throws outside a request scope — which is where verify/smoke run under tsx.
// There a floating promise is correct: the script's process stays alive
// polling the DB until the job resolves.
function runInBackground(work: () => Promise<void>) {
  try {
    after(work);
  } catch {
    void work();
  }
}

/**
 * Preserve the player's current avatar set in the catalog before a regen
 * blanks it. Pre-catalog sets (written to the old un-versioned Blob keys)
 * only exist in the players row, so without this snapshot a regen would be
 * the last time anyone saw them. Idempotent via the avatarUrl check.
 * Exported for the verify harness.
 */
export async function snapshotCurrentPortrait(
  player: typeof players.$inferSelect
): Promise<void> {
  if (!player.avatarUrl) return;
  const [existing] = await db
    .select({ id: playerPortraits.id })
    .from(playerPortraits)
    .where(
      and(
        eq(playerPortraits.playerId, player.id),
        eq(playerPortraits.avatarUrl, player.avatarUrl)
      )
    );
  if (existing) return;
  await db.insert(playerPortraits).values({
    playerId: player.id,
    archetype: player.wizardArchetype,
    selfieUrl: player.selfieUrl,
    avatarUrl: player.avatarUrl,
    avatarWoundedUrl: player.avatarWoundedUrl,
    avatarCriticalUrl: player.avatarCriticalUrl,
    avatarVictoryUrl: player.avatarVictoryUrl,
    avatarDefeatUrl: player.avatarDefeatUrl,
  });
}

export async function startWizardGeneration({
  playerId,
  theme,
  archetype,
  freeform,
  selfie,
}: {
  playerId: string;
  theme: PortraitTheme;
  /** Already validated against the theme's pack by the caller. */
  archetype: string;
  freeform: string;
  selfie: File;
}) {
  // Wardrobe chooser label: themed sets get the theme name, plain wizard
  // sets rely on the archetype alone.
  const themeLabel = theme === "standard" ? null : PORTRAIT_THEME_LABELS[theme];
  const [current] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));
  if (current) await snapshotCurrentPortrait(current);

  // Mark "generation in progress" so the page can show a polling state.
  // We blank out the avatar columns so the UI doesn't show the stale wizard
  // while the new one is being generated. Clear any prior error so a retry
  // doesn't show the old failure message alongside the in-progress spinner.
  await db
    .update(players)
    .set({
      wizardArchetype: archetype,
      wizardJobStartedAt: new Date(),
      wizardJobError: null,
      avatarUrl: null,
      avatarWoundedUrl: null,
      avatarCriticalUrl: null,
      avatarVictoryUrl: null,
      avatarDefeatUrl: null,
    })
    .where(eq(players.id, playerId));

  // Capture the selfie bytes synchronously — the File reference is tied to
  // the form-data parser's request lifetime and can't be read after this
  // function returns. The Buffer copy survives the background job.
  const selfieBuffer = Buffer.from(await selfie.arrayBuffer());
  const selfieType = selfie.type || "image/jpeg";

  // Background the FLUX + upload work (~2.5 min) past the response. `after()`
  // keeps the function instance alive until this resolves or until Vercel's
  // function-duration ceiling (300s on Hobby) kills it. The inner signal
  // gives the pipeline a chance to bail cleanly at 240s — before the cold
  // kill — so the catch block can clear the in-progress flag.
  runInBackground(async () => {
    const signal = AbortSignal.timeout(240_000);
    try {
      const reconstituted = new File(
        [new Uint8Array(selfieBuffer)],
        "selfie",
        { type: selfieType }
      );
      const portraitId = crypto.randomUUID();
      const {
        selfiePath,
        freshPath,
        woundedPath,
        criticalPath,
        victoryPath,
        defeatPath,
      } = await generateWizardVariantsFromSelfie({
        playerId,
        portraitId,
        selfie: reconstituted,
        theme,
        archetype,
        freeform,
        signal,
      });
      // Catalog row id doubles as the Blob key segment so a row always maps
      // to the objects it references.
      await db.insert(playerPortraits).values({
        id: portraitId,
        playerId,
        archetype,
        themeLabel,
        selfieUrl: selfiePath,
        avatarUrl: freshPath,
        avatarWoundedUrl: woundedPath,
        avatarCriticalUrl: criticalPath,
        avatarVictoryUrl: victoryPath,
        avatarDefeatUrl: defeatPath,
      });
      await db
        .update(players)
        .set({
          avatarUrl: freshPath,
          avatarWoundedUrl: woundedPath,
          avatarCriticalUrl: criticalPath,
          avatarVictoryUrl: victoryPath,
          avatarDefeatUrl: defeatPath,
          selfieUrl: selfiePath,
          wizardArchetype: archetype,
          wizardJobStartedAt: null,
          wizardJobError: null,
        })
        .where(eq(players.id, playerId));
    } catch (err) {
      console.error("[wizardize] background job failed:", err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Unknown error during wizard generation.";
      // Truncate so a multi-KB stack-trace-ish error from FLUX or sharp
      // doesn't bloat every player row.
      const truncated = message.slice(0, 800);
      // Clear the in-progress flag and record the failure so the UI can
      // explain what went wrong instead of silently returning to idle.
      await db
        .update(players)
        .set({ wizardJobStartedAt: null, wizardJobError: truncated })
        .where(eq(players.id, playerId));
    }
  });
}

/**
 * Re-apply a cataloged portrait set as the player's active avatar. Domain
 * core (no authz) — `applyPortraitAction` adds the owner check, the verify
 * harness drives this directly.
 */
export async function applyPortraitToPlayer(
  playerId: string,
  portraitId: string
): Promise<void> {
  const [portrait] = await db
    .select()
    .from(playerPortraits)
    .where(
      and(
        eq(playerPortraits.id, portraitId),
        eq(playerPortraits.playerId, playerId)
      )
    );
  if (!portrait) throw new Error("Portrait not found");
  await db
    .update(players)
    .set({
      avatarUrl: portrait.avatarUrl,
      avatarWoundedUrl: portrait.avatarWoundedUrl,
      avatarCriticalUrl: portrait.avatarCriticalUrl,
      avatarVictoryUrl: portrait.avatarVictoryUrl,
      avatarDefeatUrl: portrait.avatarDefeatUrl,
      selfieUrl: portrait.selfieUrl,
      wizardArchetype: portrait.archetype,
    })
    .where(eq(players.id, playerId));
}

/**
 * Delete a cataloged portrait set: the row, then its Blob objects. Domain
 * core (no authz) — `deletePortraitAction` adds the owner check.
 *
 * The active set is refused server-side (not just hidden in the UI): its
 * URLs are live in the players row, so deleting the blobs would break the
 * avatar everywhere it renders. Blob deletion is best-effort and only for
 * https URLs — legacy `/files/` rows just drop the catalog row.
 */
export async function deletePortraitForPlayer(
  playerId: string,
  portraitId: string
): Promise<void> {
  const [portrait] = await db
    .select()
    .from(playerPortraits)
    .where(
      and(
        eq(playerPortraits.id, portraitId),
        eq(playerPortraits.playerId, playerId)
      )
    );
  if (!portrait) throw new Error("Portrait not found");
  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));
  if (player?.avatarUrl && player.avatarUrl === portrait.avatarUrl) {
    throw new Error(
      "This is your current wizard — apply a different one before deleting it."
    );
  }

  await db
    .delete(playerPortraits)
    .where(eq(playerPortraits.id, portraitId));

  const blobUrls = [
    portrait.avatarUrl,
    portrait.avatarWoundedUrl,
    portrait.avatarCriticalUrl,
    portrait.avatarVictoryUrl,
    portrait.avatarDefeatUrl,
    portrait.selfieUrl,
  ]
    .filter((u): u is string => Boolean(u?.startsWith("https://")))
    .map((u) => u.split("?")[0]);
  if (blobUrls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
    const { del } = await import("@vercel/blob");
    await del(blobUrls).catch((err) =>
      console.error("[wardrobe] blob cleanup failed:", err)
    );
  }
}
