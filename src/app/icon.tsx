import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

// Source portrait is the winning wizard from the May 12 tournament (Andrew
// Archer's "victory" tier). Stored in /public so the deploy bundle includes
// it; consumed here at SSG time to produce the manifest's 192/512 PNGs.
const SOURCE = readFileSync(
  join(process.cwd(), "public/icons/winner-victory.jpg")
);

export function generateImageMetadata() {
  return [
    {
      id: "icon-192",
      size: { width: 192, height: 192 },
      contentType: "image/png",
    },
    {
      id: "icon-512",
      size: { width: 512, height: 512 },
      contentType: "image/png",
    },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const resolvedId = await id;
  const size = resolvedId === "icon-512" ? 512 : 192;
  const png = await sharp(SOURCE)
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png" },
  });
}
