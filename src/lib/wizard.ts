import { put } from "@vercel/blob";
import sharp from "sharp";
// heic-convert ships no types; declare a minimal ambient signature inline.
// Sharp's bundled libheif on macOS Apple Silicon does NOT ship the HEVC
// decoder plugin, so iPhone HEIC photos (which are HEVC-compressed) crash
// with "Support for this compression format has not been built in". We sniff
// for HEIC magic bytes and round-trip through heic-convert (pure JS) first,
// then hand a JPEG to Sharp. ~3-5s per HEIC; non-HEIC inputs skip this.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heicConvert = require("heic-convert") as (args: {
  buffer: ArrayBufferLike | Uint8Array;
  format: "JPEG" | "PNG";
  quality?: number;
}) => Promise<ArrayBufferLike>;
import { WIZARD_ARCHETYPES, type WizardArchetype } from "./wizard-types";

export { WIZARD_ARCHETYPES, type WizardArchetype };

const IMAGE_GEN_URL =
  process.env.IMAGE_GEN_URL ??
  process.env.IMAGEGEN_URL ??
  "http://127.0.0.1:8000";
const IMAGEGEN_FILES_TOKEN = process.env.IMAGEGEN_FILES_TOKEN;

/**
 * Detect HEIC/HEIF by ISO BMFF box magic (bytes 4-7 == "ftyp" and brand 8-11
 * matches a known HEIC variant). Cheaper and more reliable than trusting the
 * MIME type or filename, both of which iOS sometimes drops.
 */
function isHeic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12);
  return ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(brand);
}

/**
 * Normalize any iPhone-friendly input (HEIC, HEIF, JPEG, PNG, WebP) to a
 * 1024×1024 letterboxed JPEG. HEIC inputs are pre-converted via heic-convert
 * because Sharp's libheif on this build can't handle HEVC. `fit: contain`
 * keeps the whole frame so we never accidentally chop a face out of an
 * off-center selfie.
 */
async function selfieToSquareJpeg(input: Buffer): Promise<Buffer> {
  let decoded = input;
  if (isHeic(input)) {
    const out = await heicConvert({ buffer: input, format: "JPEG", quality: 0.95 });
    decoded = Buffer.from(out as ArrayBuffer);
  }
  return sharp(decoded, { failOn: "none" })
    .rotate() // honor EXIF orientation (iPhone defaults to landscape sensor)
    .resize({
      width: 1024,
      height: 1024,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

// Each archetype is described as additions/changes only — costume + setting.
// The face/skin/hair come from the reference image. FLUX.2 Klein edit is
// instruction-based, so we lead with "Keep the person's face exactly the same"
// rather than describing the whole subject.
const ARCHETYPE_DETAILS: Record<WizardArchetype, string> = {
  pyromancer:
    "deep crimson and gold wizard robes; embers and sparks drifting around their head; warm orange firelight on their face; smouldering ash background",
  "frost mage":
    "ice-blue and silver robes with white fur trim; pale blue magical glow on their skin; frost crystals on their shoulders; misty cold-blue background",
  druid:
    "moss-green hooded cloak with leaf and antler accents; ivy threaded through their hair; soft golden forest light on their face; blurred forest background",
  necromancer:
    "tattered black and bone-white robes; faint violet glow underlighting their face; wisps of green spirit smoke nearby; dim candlelit crypt background",
  illusionist:
    "iridescent purple and silver silken robes; soft prismatic light playing across their face; small mirror shards floating beside their head; dreamy haze background",
  stormcaller:
    "stormcloud-grey robes; arcs of blue lightning crackling around their shoulders; wind tousling their hair; turbulent stormy sky background",
  "blood mage":
    "deep burgundy robes with iron clasps; faint red ritual sigils glowing on their skin; warm candlelight on their face; dark stone chamber background",
  archmage:
    "ornate royal-blue robe trimmed with gold runes; glowing arcane sigils orbiting their head; warm golden light on their face; arcane library background",
};

export function buildWizardPrompt(
  archetype: WizardArchetype,
  freeform?: string
): string {
  const details = ARCHETYPE_DETAILS[archetype];
  const extra = freeform?.trim() ? ` Also: ${freeform.trim()}.` : "";
  // Instruction-style: identity lock first, then additive costume/setting.
  return (
    `Keep this exact person — their face, skin tone, hair, and expression must stay identical. ` +
    `Dress them as a ${archetype}: ${details}.${extra} ` +
    `Shoulders-up portrait, painterly oil-painting style, dramatic chiaroscuro lighting. ` +
    `Do not change their face or facial features.`
  );
}

export type WizardTier =
  | "fresh"
  | "wounded"
  | "critical"
  | "victory"
  | "defeat";

const TIER_SUFFIX: Record<WizardTier, string> = {
  fresh: "",
  wounded:
    " They look battle-weary: robes dusted and slightly torn at the shoulders, soft motes of light drifting around them, expression strained but determined, tired eyes.",
  // Family-friendly: weariness and weathered robes, no blood or gore.
  critical:
    " They are exhausted and weathered from a long duel: robes scorched and frayed at the edges, faint glowing motes of magic dimming around them, brow furrowed with focused resolve, eyes still bright with fight. Painterly, dramatic but never gory — no blood, no wounds, no fear, suitable for all ages.",
  victory:
    " They have just won the duel: a wry, satisfied smile playing at the corner of their mouth, eyes alight with quiet triumph, posture relaxed and confident, soft golden rim-light glowing around them, a faint shower of magical sparks rising in celebration.",
  defeat:
    " The duel is over and they have been vanquished: head hung slightly, chin lowered toward their chest, eyes cast downward in quiet resignation, no smile, expression solemn and accepting. Robes scorched and frayed at the shoulders just like in the critical state — visibly weathered from the fight. The magical glow around them has dimmed to almost nothing, ambient light cool and somber. Family-friendly, no blood, no anguish, no tears — dignified defeat.",
};

/**
 * Like buildWizardPrompt, but appends a tier-specific suffix so the same
 * archetype renders three life-state variants. Identity lock and base costume
 * stay the same so the three portraits are recognizably the same wizard.
 */
export function buildVariantPrompt(
  archetype: WizardArchetype,
  freeform: string | undefined,
  tier: WizardTier
): string {
  return buildWizardPrompt(archetype, freeform) + TIER_SUFFIX[tier];
}

export type WizardVariantResult = {
  selfiePath: string;
  freshPath: string;
  woundedPath: string;
  criticalPath: string;
  victoryPath: string;
  defeatPath: string;
};

/**
 * Single-shot identity-preserving image edit: take a normalized selfie and a
 * prompt, return the generated JPEG bytes. The wizard pipeline calls this
 * once per tier with the same selfie buffer, so re-encoding is avoided.
 *
 * Lifted behind a type so the FLUX-on-Mac implementation can be swapped for
 * a hosted provider (e.g. fal.ai's FLUX.2 Klein edit) by setting
 * IMAGE_GEN_PROVIDER. Today only "local" exists.
 */
export type ImageEditor = (
  selfie: Buffer,
  prompt: string,
  signal?: AbortSignal
) => Promise<Buffer>;

const localFluxEditor: ImageEditor = async (selfieBuf, prompt, signal) => {
  const fd = new FormData();
  fd.set("prompt", prompt);
  fd.set("width", "1024");
  fd.set("height", "1024");
  fd.set("steps", "4");
  fd.set("guidance", "1.0");
  fd.set(
    "images",
    new Blob([new Uint8Array(selfieBuf)], { type: "image/jpeg" }),
    "selfie.jpg"
  );

  const res = await fetch(`${IMAGE_GEN_URL}/edit`, {
    method: "POST",
    body: fd,
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`/edit returned ${res.status}: ${text.slice(0, 500)}`);
  }
  const out = Buffer.from(await res.arrayBuffer());
  if (out.length < 1024) {
    throw new Error(
      `/edit returned only ${out.length} bytes — likely an error JSON.`
    );
  }
  return out;
};

function getImageEditor(): ImageEditor {
  const provider = process.env.IMAGE_GEN_PROVIDER ?? "local";
  switch (provider) {
    case "local":
      return localFluxEditor;
    default:
      throw new Error(
        `Unknown IMAGE_GEN_PROVIDER: ${provider} (expected "local")`
      );
  }
}

/**
 * Persist a generated JPEG and return the URL the DB should reference.
 *
 * When `BLOB_READ_WRITE_TOKEN` is set, writes to Vercel Blob with a stable
 * key (`avatars/<playerId>/<tier>.jpg`) under `allowOverwrite: true`, so a
 * regenerate hits the same object and `players.avatar*Url` rows never go
 * stale. A query-string cache buster forces browsers to drop their old copy
 * on regen.
 *
 * When the token is unset (e.g. `npm run lan` without cloud creds), falls
 * back to the legacy image-gen `/files/<name>` endpoint and returns a
 * relative `/files/...` path — the Next.js proxy at /files/[file] serves
 * those.
 */
async function uploadPortrait(
  blobKey: string,
  legacyFileName: string,
  buf: Buffer,
  signal?: AbortSignal
): Promise<string> {
  const cacheBuster = Date.now();
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const result = await put(blobKey, buf, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
    });
    return `${result.url}?v=${cacheBuster}`;
  }

  if (!IMAGEGEN_FILES_TOKEN) {
    throw new Error(
      "Neither BLOB_READ_WRITE_TOKEN nor IMAGEGEN_FILES_TOKEN is set — " +
        "wizard storage requires one of them"
    );
  }
  const res = await fetch(`${IMAGE_GEN_URL}/files/${legacyFileName}`, {
    method: "PUT",
    headers: {
      "X-Files-Token": IMAGEGEN_FILES_TOKEN,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(buf),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `PUT /files/${legacyFileName} returned ${res.status}: ${text.slice(0, 300)}`
    );
  }
  return `/files/${legacyFileName}?v=${cacheBuster}`;
}

/**
 * Normalize the uploaded selfie, run FLUX.2 Klein /edit three times
 * (fresh, wounded, critical) against the same normalized selfie buffer, then
 * upload all four images (selfie + three tiers) to the image-gen server's
 * /files endpoint. Returned paths are `/files/<name>?v=<ts>` — relative URLs
 * that the Next.js app proxies through to the image-gen server.
 *
 * Storing images on the image-gen server (not Next.js's `/public`) decouples
 * them from the build manifest, so newly generated portraits show up
 * immediately without a rebuild.
 */
export async function generateWizardVariantsFromSelfie(args: {
  playerId: string;
  selfie: File;
  archetype: WizardArchetype;
  freeform?: string;
  signal?: AbortSignal;
}): Promise<WizardVariantResult> {
  const { playerId, selfie, archetype, freeform, signal } = args;

  // Normalize whatever the phone uploaded (HEIC, JPEG, PNG, WebP, …) into a
  // 1024² JPEG. We persist this normalized copy and feed it to FLUX as-is
  // for all three tier passes.
  const rawBuf = Buffer.from(await selfie.arrayBuffer());
  const selfieBuf = await selfieToSquareJpeg(rawBuf);

  // Probe the server first so we can return a friendly error before we
  // commit to three sequential ~30s requests.
  try {
    const health = await fetch(`${IMAGE_GEN_URL}/health`, {
      cache: "no-store",
      signal,
    });
    if (!health.ok) throw new Error(`status ${health.status}`);
  } catch (err) {
    throw new Error(
      `Local image-gen server not reachable at ${IMAGE_GEN_URL}. Start it with: ~/Programs/image-gen/bin/imagegen start\n(${(err as Error).message})`
    );
  }

  // Five sequential /edit calls, same input buffer, five tier-specific
  // prompts. ~30 s each on the local FLUX server (~2.5 min total).
  const tiers: WizardTier[] = [
    "fresh",
    "wounded",
    "critical",
    "victory",
    "defeat",
  ];
  const buffers: Record<WizardTier, Buffer> = {} as Record<WizardTier, Buffer>;
  const edit = getImageEditor();
  for (const tier of tiers) {
    const prompt = buildVariantPrompt(archetype, freeform, tier);
    buffers[tier] = await edit(selfieBuf, prompt, signal);
  }

  // Stable keys per (player, tier). Blob writes with allowOverwrite so the
  // URL prefix never changes — only the cache-buster suffix does. Legacy
  // filename kept identical to the pre-Blob scheme so existing /files/ rows
  // and the proxy route keep working.
  const tierLegacy: Record<WizardTier, string> = {
    fresh: `wizard-${playerId}-fresh.jpg`,
    wounded: `wizard-${playerId}-wounded.jpg`,
    critical: `wizard-${playerId}-critical.jpg`,
    victory: `wizard-${playerId}-victory.jpg`,
    defeat: `wizard-${playerId}-defeat.jpg`,
  };

  const selfiePath = await uploadPortrait(
    `avatars/${playerId}/selfie.jpg`,
    `selfie-${playerId}.jpg`,
    selfieBuf,
    signal
  );
  const tierPaths = await Promise.all(
    tiers.map(async (tier) => [
      tier,
      await uploadPortrait(
        `avatars/${playerId}/${tier}.jpg`,
        tierLegacy[tier],
        buffers[tier],
        signal
      ),
    ] as const)
  );
  const byTier = Object.fromEntries(tierPaths) as Record<WizardTier, string>;

  return {
    selfiePath,
    freshPath: byTier.fresh,
    woundedPath: byTier.wounded,
    criticalPath: byTier.critical,
    victoryPath: byTier.victory,
    defeatPath: byTier.defeat,
  };
}
