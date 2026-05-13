import type { CapacitorConfig } from "@capacitor/cli";

// MTG Dash native shell — a Capacitor wrap around the production web app.
// The native binary is essentially a WebView pointing at mtg.capxun.com;
// the entire backend (server actions, RSC, SSE, Realtime, Blob, FLUX) keeps
// running on Vercel + the Mac. No bundled JS, no offline mode — the app is
// a credential-preserving shortcut into the live site that the App Store
// can list and that can hold a native push token.
//
// webDir is required by Capacitor but ignored when `server.url` is set; we
// point it at /public so the path resolves to something valid.
const config: CapacitorConfig = {
  appId: "com.capxun.mtgdash",
  appName: "MTG Dash",
  webDir: "public",
  server: {
    url: "https://mtg.capxun.com",
    cleartext: false,
    // androidScheme: "https" keeps Android's WebView on https:// so cookies
    // set by mtg.capxun.com are treated as first-party. (iOS WKWebView is
    // already first-party by default for the same host.)
    androidScheme: "https",
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
