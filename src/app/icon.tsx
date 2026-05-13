import sharp from "sharp";
import { getAppIconSource } from "@/lib/icon-source";

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
  const source = await getAppIconSource();
  const png = await sharp(source)
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  // Short private cache lets a freshly-claimed wizard show up on the next
  // tab refresh without hammering the DB. The OS caches the install-time
  // bytes forever regardless of this header, so the "frozen at install"
  // trophy property still holds.
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=60",
    },
  });
}
