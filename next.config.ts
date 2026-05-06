import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Auto-detect every non-loopback IPv4 the host is reachable on. Required so
// `next dev` permits HMR + server actions when phones load the app via the LAN
// IP — without this Next blocks them as cross-origin requests.
function detectLanOrigins(): string[] {
  const out = new Set<string>();
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const a of ifaces ?? []) {
      if (a.family === "IPv4" && !a.internal) out.add(a.address);
    }
  }
  return [...out];
}

const nextConfig: NextConfig = {
  experimental: {
    // iPhone HEIC selfies routinely exceed the 1MB default. Sharp resizes them
    // down to ~150KB after upload, but we have to receive the original first.
    serverActions: { bodySizeLimit: "20mb" },
  },
  allowedDevOrigins: detectLanOrigins(),
};

export default nextConfig;
