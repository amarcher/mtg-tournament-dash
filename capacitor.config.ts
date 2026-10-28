/// <reference types="@capacitor/status-bar" />
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
const CANVAS = "#0d0a07";

const config: CapacitorConfig = {
  appId: "com.capxun.mtgdash",
  appName: "MTG Dash",
  webDir: "public",
  // Only visible for the instant before the first page paints — the WebView
  // runs edge-to-edge (Capacitor's default contentInset: never), so nothing
  // is inset.
  backgroundColor: CANVAS,
  server: {
    url: "https://mtg.capxun.com",
    cleartext: false,
    // androidScheme: "https" keeps Android's WebView on https:// so cookies
    // set by mtg.capxun.com are treated as first-party. (iOS WKWebView is
    // already first-party by default for the same host.)
    androidScheme: "https",
  },
  plugins: {
    // Light status-bar text drawn over the page. The site declares
    // viewport-fit=cover and pads its own header, tab bar and scorekeeper with
    // env(safe-area-inset-*), so the page owns the status-bar and
    // home-indicator strips; insetting the WebView instead left flat
    // backgroundColor bands above and below the page (TestFlight build 2).
    StatusBar: {
      style: "DARK",
      overlaysWebView: true,
    },
    SystemBars: {
      style: "DARK",
      insetsHandling: "css",
    },
  },
};

export default config;
