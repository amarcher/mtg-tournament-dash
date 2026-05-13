import sharp from "sharp";
import { getAppIconSource } from "@/lib/icon-source";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const source = await getAppIconSource();
  const png = await sharp(source)
    .resize(size.width, size.height, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=60",
    },
  });
}
