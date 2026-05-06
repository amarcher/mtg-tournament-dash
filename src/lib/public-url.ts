import { networkInterfaces } from "node:os";
import { headers } from "next/headers";

/**
 * Resolve the absolute base URL phones should hit (e.g. for QR codes that
 * encode a join URL). Order of preference:
 *
 *   1. `PUBLIC_URL` env var, if set — gives the operator a hard override
 *      (useful in production, behind a reverse proxy, with a custom domain).
 *   2. The incoming request's `x-forwarded-*` / `host` headers, *unless*
 *      the host is loopback (`localhost` / `127.0.0.1`), in which case
 *      a localhost-encoded QR would be unreachable from phones.
 *   3. Auto-detected LAN IP from `os.networkInterfaces()`, preserving the
 *      port the request came in on.
 *
 * Returns a string with no trailing slash.
 */
export async function getPublicBaseUrl(): Promise<string> {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/+$/, "");
  }

  const h = await headers();
  const fwdHost = h.get("x-forwarded-host");
  const reqHost = h.get("host") ?? "localhost:3000";
  const host = fwdHost ?? reqHost;
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  if (isLoopback(host)) {
    const port = host.includes(":") ? host.split(":").pop()! : "3000";
    const lan = detectLanIp();
    if (lan) return `${proto}://${lan}:${port}`;
  }

  return `${proto}://${host}`;
}

function isLoopback(host: string) {
  const bare = host.split(":")[0];
  return bare === "localhost" || bare === "127.0.0.1" || bare === "::1";
}

function detectLanIp(): string | null {
  const ifaces = networkInterfaces();
  // Prefer en0 (typical macOS Wi-Fi); fall back to any non-internal IPv4.
  const order = ["en0", "en1", ...Object.keys(ifaces).filter((k) => !["en0", "en1"].includes(k))];
  for (const name of order) {
    for (const addr of ifaces[name] ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}
