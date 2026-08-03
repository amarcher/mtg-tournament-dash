import { fal } from "@fal-ai/client";
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
import {
  WIZARD_ARCHETYPES,
  type LotrArchetype,
  type PortraitTheme,
  type WizardArchetype,
} from "./wizard-types";

export { WIZARD_ARCHETYPES, type WizardArchetype };

const IMAGE_GEN_URL =
  process.env.IMAGE_GEN_URL ?? "http://127.0.0.1:8000";

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

// LOTR characters are full transformations, not just costumes, so each entry
// is a complete noun phrase. Same additive framing as the wizard archetypes:
// costume + setting only, the face stays locked. Family-friendly throughout.
const LOTR_DETAILS: Record<LotrArchetype, string> = {
  hobbit:
    "a hobbit of the Shire: homespun waistcoat with brass buttons over a linen shirt, slightly pointed ears, warm afternoon sun, a round green hobbit-hole door and rolling green hills behind them",
  elf:
    "an elf of Rivendell: gracefully pointed ears, flowing silver-embroidered robes, a delicate circlet across their brow, ethereal golden light through autumn leaves and waterfalls behind them",
  dwarf:
    "a dwarf of Erebor: a magnificent thick braided beard with metal clasps, heavy fur-trimmed leather armor, a war axe resting on their shoulder, torch-lit carved stone halls behind them",
  ranger:
    "a ranger of the North: weathered dark-green hooded cloak, worn leather jerkin, a sword hilt visible at their shoulder, stubble and windswept hair, misty wilds and pines behind them",
  wizard:
    "a wizard of Middle-earth: long grey robes, a wide-brimmed pointed grey hat, a long flowing beard, a gnarled wooden staff in hand, warm pipe-smoke light in a cozy study behind them",
  "rider of Rohan":
    "a rider of Rohan: burnished scale-and-leather horse-lord armor with a horsehair-plumed helm tucked under one arm, braided hair, golden grass plains and distant mountains behind them",
  "king of Gondor":
    "a king of Gondor: a silver winged crown, black-and-silver royal regalia embroidered with a white tree, a fur-lined mantle, the white stone citadel of Minas Tirith behind them",
  ent:
    "an ent of Fangorn Forest: weathered bark-textured skin in mossy greens and browns, leafy twigs and small living branches growing from their hair and beard, deep wise amber eyes, ancient gnarled trees and dappled forest light behind them — keep their facial features clearly recognizable beneath the bark",
  orc:
    "an orc of Mordor: mottled green-grey weathered skin, pointed ears, jagged crude iron-and-leather armor with rough stitching, a few battle scars, smoky torchlight and dark crags behind them — fierce but family-friendly, keep their facial features clearly recognizable",
  Sméagol:
    "Sméagol: gaunt and pale with huge round pleading eyes, a few sparse strands of hair, a ragged simple garment, hunched posture, cradling a small golden ring in their hands, moonlit cave pool behind them — endearing and family-friendly, never frightening",
};

export function buildWizardPrompt(
  theme: PortraitTheme,
  archetype: string,
  freeform?: string
): string {
  const extra = freeform?.trim() ? ` Also: ${freeform.trim()}.` : "";
  const costume =
    theme === "lotr"
      ? `Transform them into ${
          LOTR_DETAILS[archetype as LotrArchetype] ?? LOTR_DETAILS.wizard
        }.`
      : `Dress them as a ${archetype}: ${
          ARCHETYPE_DETAILS[archetype as WizardArchetype] ??
          ARCHETYPE_DETAILS.archmage
        }.`;
  // Instruction-style: identity lock first, then additive costume/setting.
  return (
    `Keep this exact person — their face, skin tone, hair, and expression must stay identical. ` +
    `${costume}${extra} ` +
    `Shoulders-up portrait, painterly oil-painting style, dramatic chiaroscuro lighting. ` +
    `Do not change their face or facial features.`
  );
}

/**
 * Load a previously stored seed selfie so a regen doesn't require
 * re-uploading. Handles both absolute Blob URLs and legacy `/files/...`
 * paths served by the image-gen server.
 */
export async function fetchStoredSelfie(url: string): Promise<File> {
  const resolved = url.startsWith("http") ? url : `${IMAGE_GEN_URL}${url}`;
  const res = await fetch(resolved, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Couldn't load your saved selfie (HTTP ${res.status}) — upload a new one instead.`
    );
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 1024) {
    throw new Error(
      "Your saved selfie looks corrupt — upload a new one instead."
    );
  }
  return new File([buf], "saved-selfie.jpg", { type: "image/jpeg" });
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
  theme: PortraitTheme,
  archetype: string,
  freeform: string | undefined,
  tier: WizardTier
): string {
  return buildWizardPrompt(theme, archetype, freeform) + TIER_SUFFIX[tier];
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

// Hosted alternative — fal.ai's FLUX.2 Klein /edit. Same model checkpoint as
// the Mac runs, so prompts port without re-tuning. The flow is:
//   1. Upload the normalized selfie buffer to fal.storage → get a URL
//   2. POST { prompt, image_urls } to the model endpoint
//   3. Download the result image bytes from the URL fal returns
// The `signal` is honored on the result download so a `after()` budget kill
// cancels the in-flight bytes; the subscribe poll itself runs sub-second on
// Klein in practice so isn't worth threading.
const falFluxEditor: ImageEditor = async (selfieBuf, prompt, signal) => {
  if (!process.env.FAL_KEY) {
    throw new Error("IMAGE_GEN_PROVIDER=fal but FAL_KEY is not set");
  }
  const selfieBlob = new File(
    [new Uint8Array(selfieBuf)],
    "selfie.jpg",
    { type: "image/jpeg" }
  );
  const imageUrl = await fal.storage.upload(selfieBlob);
  let result;
  try {
    result = await fal.subscribe("fal-ai/flux-2/klein/4b/edit", {
      input: {
        prompt,
        image_urls: [imageUrl],
      },
      logs: false,
    });
  } catch (err) {
    // fal's ValidationError surfaces { status, body: { detail: [...] } } where
    // detail describes which field failed. Node's default console depth
    // truncates the nested array to `[Object]` — re-throw with the body
    // expanded so the runtime logs tell us *what* fal rejected.
    const e = err as { status?: number; body?: unknown; message?: string };
    const bodyJson =
      e.body !== undefined ? JSON.stringify(e.body, null, 2) : "(no body)";
    throw new Error(
      `fal.subscribe failed (status=${e.status ?? "?"}): ${e.message ?? "(no msg)"}\n` +
        `prompt(${prompt.length} chars): ${prompt.slice(0, 200)}…\n` +
        `body: ${bodyJson}`
    );
  }
  const outUrl = (
    result.data as { images?: Array<{ url: string }> } | undefined
  )?.images?.[0]?.url;
  if (!outUrl) {
    throw new Error("fal.ai returned no image URL");
  }
  const res = await fetch(outUrl, { signal });
  if (!res.ok) {
    throw new Error(`fetching fal output failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
};

function getImageEditor(): ImageEditor {
  const provider = process.env.IMAGE_GEN_PROVIDER ?? "local";
  switch (provider) {
    case "local":
      return localFluxEditor;
    case "fal":
      return falFluxEditor;
    default:
      throw new Error(
        `Unknown IMAGE_GEN_PROVIDER: ${provider} (expected "local" or "fal")`
      );
  }
}

/**
 * Persist a generated JPEG to Vercel Blob and return the DB-bound URL.
 *
 * Keys are versioned per generation (see keyPrefix at the call site), so
 * `allowOverwrite` only matters for a retried upload of the same generation.
 * The query-string cache buster forces browsers to drop a stale copy when a
 * player re-applies a cataloged set whose URL they've seen before.
 */
async function uploadPortrait(blobKey: string, buf: Buffer): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN not set — `vercel env pull` or provision " +
        "the Blob marketplace integration first"
    );
  }
  const result = await put(blobKey, buf, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "image/jpeg",
  });
  return `${result.url}?v=${Date.now()}`;
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
  /** Versioned Blob-key segment — one per generation, so older cataloged
   * portrait sets are never overwritten by a regen. */
  portraitId: string;
  selfie: File;
  theme: PortraitTheme;
  archetype: string;
  freeform?: string;
  signal?: AbortSignal;
}): Promise<WizardVariantResult> {
  const { playerId, portraitId, selfie, theme, archetype, freeform, signal } =
    args;

  // Normalize whatever the phone uploaded (HEIC, JPEG, PNG, WebP, …) into a
  // 1024² JPEG. We persist this normalized copy and feed it to FLUX as-is
  // for all three tier passes.
  const rawBuf = Buffer.from(await selfie.arrayBuffer());
  const selfieBuf = await selfieToSquareJpeg(rawBuf);

  // Probe the local FLUX server so we fail with a friendly "start the Mac"
  // message before committing to five sequential ~30s requests. Skipped on
  // hosted providers (fal.ai) since their /health surface isn't ours and a
  // failed call there will surface its own error anyway.
  if ((process.env.IMAGE_GEN_PROVIDER ?? "local") === "local") {
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
  }

  // Five sequential /edit calls, same input buffer, five tier-specific
  // prompts. ~30 s each on the local FLUX server (~2.5 min total) or
  // sub-second each on fal.ai (~5 s total).
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
    const prompt = buildVariantPrompt(theme, archetype, freeform, tier);
    buffers[tier] = await edit(selfieBuf, prompt, signal);
  }

  // Versioned keys per generation: the portraitId segment means a regen
  // writes fresh Blob objects, so every set in the player_portraits catalog
  // keeps rendering forever. (Pre-catalog sets live at the old un-versioned
  // avatars/<playerId>/<tier>.jpg keys, which nothing writes to anymore.)
  const keyPrefix = `avatars/${playerId}/${portraitId}`;
  const selfiePath = await uploadPortrait(`${keyPrefix}/selfie.jpg`, selfieBuf);
  const tierPaths = await Promise.all(
    tiers.map(
      async (tier) =>
        [
          tier,
          await uploadPortrait(`${keyPrefix}/${tier}.jpg`, buffers[tier]),
        ] as const
    )
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
