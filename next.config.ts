import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // iPhone HEIC selfies routinely exceed the 1MB default. Sharp resizes them
    // down to ~150KB after upload, but we have to receive the original first.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
