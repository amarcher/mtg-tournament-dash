import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
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

const IMAGEGEN_URL =
  process.env.IMAGEGEN_URL ?? "http://127.0.0.1:8000";

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

export type WizardTier = "fresh" | "wounded" | "critical";

const TIER_SUFFIX: Record<WizardTier, string> = {
  fresh: "",
  wounded:
    " They look battle-weary: robes torn and ash-streaked at the shoulders, smoke and embers drifting around them, expression strained but determined, weary eyes.",
  critical:
    " They are at the edge of defeat: bloodied face, gaunt cheeks, eyes glowing fiercely, robes ragged and burned, last-stand pose, dramatic crimson backlight.",
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
  selfiePath: string; // public path, e.g. /selfies/abc.jpg
  freshPath: string;
  woundedPath: string;
  criticalPath: string;
};

/**
 * POST a single FLUX `/edit` request against an already-normalized selfie
 * buffer and return the generated image bytes. The buffer is reused across
 * tiers so we don't re-encode the JPEG three times.
 */
async function editOnce(
  selfieBuf: Buffer,
  prompt: string
): Promise<Buffer> {
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

  const res = await fetch(`${IMAGEGEN_URL}/edit`, {
    method: "POST",
    body: fd,
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
}

/**
 * Save the uploaded selfie to disk and run FLUX.2 Klein /edit three times
 * (fresh, wounded, critical) against the same normalized selfie buffer.
 * Calls are sequential so a single GPU isn't asked to run three jobs at
 * once. All four returned paths are public URLs (relative to /) with
 * `?v=<timestamp>` cache busters.
 */
export async function generateWizardVariantsFromSelfie(args: {
  playerId: string;
  selfie: File;
  archetype: WizardArchetype;
  freeform?: string;
}): Promise<WizardVariantResult> {
  const { playerId, selfie, archetype, freeform } = args;

  const publicDir = join(process.cwd(), "public");
  await mkdir(join(publicDir, "selfies"), { recursive: true });
  await mkdir(join(publicDir, "wizards"), { recursive: true });

  // Normalize whatever the phone uploaded (HEIC, JPEG, PNG, WebP, …) into a
  // 1024² JPEG. We persist this normalized copy and feed it to FLUX as-is
  // for all three tier passes.
  const rawBuf = Buffer.from(await selfie.arrayBuffer());
  const selfieBuf = await selfieToSquareJpeg(rawBuf);
  const selfieRel = `/selfies/${playerId}.jpg`;
  await writeFile(join(publicDir, "selfies", `${playerId}.jpg`), selfieBuf);

  // Probe the server first so we can return a friendly error before we
  // commit to three sequential ~30s requests.
  try {
    const health = await fetch(`${IMAGEGEN_URL}/health`, {
      cache: "no-store",
    });
    if (!health.ok) throw new Error(`status ${health.status}`);
  } catch (err) {
    throw new Error(
      `Local image-gen server not reachable at ${IMAGEGEN_URL}. Start it with: cd ~/Programs/image-gen && FLUX_MODEL=flux2-klein nohup uv run uvicorn server.main:app --host 127.0.0.1 --port 8000 > /tmp/imagegen.log 2>&1 & disown\n(${(err as Error).message})`
    );
  }

  // Three sequential /edit calls, same input buffer, three tier-specific
  // prompts. ~30s each on the local FLUX server.
  const tiers: WizardTier[] = ["fresh", "wounded", "critical"];
  const buffers: Record<WizardTier, Buffer> = {} as Record<WizardTier, Buffer>;
  for (const tier of tiers) {
    const prompt = buildVariantPrompt(archetype, freeform, tier);
    buffers[tier] = await editOnce(selfieBuf, prompt);
  }

  const v = Date.now();
  await Promise.all(
    tiers.map((tier) =>
      writeFile(
        join(publicDir, "wizards", `${playerId}-${tier}.jpg`),
        buffers[tier]
      )
    )
  );

  return {
    selfiePath: `${selfieRel}?v=${v}`,
    freshPath: `/wizards/${playerId}-fresh.jpg?v=${v}`,
    woundedPath: `/wizards/${playerId}-wounded.jpg?v=${v}`,
    criticalPath: `/wizards/${playerId}-critical.jpg?v=${v}`,
  };
}
