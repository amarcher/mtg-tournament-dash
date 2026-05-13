import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// `metadataBase` lets relative OG image paths in nested segments resolve to
// absolute URLs in the <head> output, which iMessage / Slack / X all require
// in order to actually fetch the image. Falls back to the production tunnel
// hostname so the local build doesn't crash without PUBLIC_URL set.
const metadataBaseUrl =
  process.env.PUBLIC_URL?.replace(/\/+$/, "") ?? "https://mtg.capxun.com";

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: {
    default: "MTG Dash",
    template: "%s · MTG Dash",
  },
  description:
    "House tournament tracker — Swiss pairings, live life totals on a TV, AI-generated wizard portraits that take damage as you lose life, and ELO history across events.",
  applicationName: "MTG Dash",
  openGraph: {
    type: "website",
    siteName: "MTG Dash",
    title: "MTG Dash",
    description:
      "House MTG tournaments with live broadcast, phone scorekeeping, and wizard portraits.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MTG Dash",
    description:
      "House MTG tournaments with live broadcast, phone scorekeeping, and wizard portraits.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // GA4 measurement ID is build-time inlined via the NEXT_PUBLIC_ prefix.
  // Unset (empty string) means GA is silently disabled — local dev, anyone
  // running without analytics, the verify harness, etc. all work without a
  // gtag round-trip. Production needs NEXT_PUBLIC_GA4_MEASUREMENT_ID set in
  // .env.local before `npm run build` so the value is baked into the bundle.
  const gaId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

  return (
    // suppressHydrationWarning on <html>/<body> swallows attribute diffs
    // caused by Chrome extensions that inject markers into the document
    // (e.g. Google's "__gcrremoteframetoken"). React's hydration is otherwise
    // strict and surfaces those as scary console errors.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-zinc-950 text-zinc-100"
      >
        {children}
        {gaId && <GoogleAnalytics gaId={gaId} />}
      </body>
    </html>
  );
}
