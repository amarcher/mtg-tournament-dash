import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const SOURCE = readFileSync(
  join(process.cwd(), "public/icons/winner-victory.jpg")
);

export default async function AppleIcon() {
  const png = await sharp(SOURCE)
    .resize(size.width, size.height, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png" },
  });
}
