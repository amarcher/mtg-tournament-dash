import { ImageResponse } from "next/og";

// Two PNG icons referenced by manifest.ts: 192 (Android home-screen / install
// prompt) and 512 (Android splash / store-grade hero, also the maskable
// variant Chrome uses for adaptive masks). apple-icon.tsx handles iOS at 180.
export function generateImageMetadata() {
  return [
    { id: "icon-192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "icon-512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const resolvedId = await id;
  const size = resolvedId === "icon-512" ? 512 : 192;
  // The maskable safe zone is the inner 80%. We bias the letterforms slightly
  // smaller than apple-icon.tsx so adaptive masks (Android circle / squircle
  // / teardrop) never crop the letters at the corners.
  const fontSize = Math.round(size * 0.42);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          backgroundImage:
            "radial-gradient(circle at 50% 35%, rgba(245, 158, 11, 0.35), transparent 65%)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          color: "#fcd34d",
          fontSize,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        MTG
      </div>
    ),
    { width: size, height: size }
  );
}
