import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MTG Dash",
    short_name: "MTG",
    description:
      "House tournament tracker — Swiss pairings, live life totals, AI wizard portraits.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icon/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
