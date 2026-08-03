// Server-only by convention, but not `import "server-only"` — that throws
// under the tsx-driven verify harness (same reasoning as wizard-job.ts).
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";
import { db } from "@/db/client";

// Accounts exist for ORGANIZERS only. Players never sign in — their identity
// stays the league_token / join_token cookie scheme in src/lib/auth.ts.

function resolveBaseUrl() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  // Preview deployments: magic links point at the preview's own URL. Sessions
  // are then scoped per-deployment — expected, not a bug.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function sendMagicLink({ email, url }: { email: string; url: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Local dev without email: the link in the server log IS the sign-in.
    console.log(`[user-auth] magic link for ${email}: ${url}`);
    return;
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "MTG Dash <onboarding@resend.dev>",
    to: email,
    subject: "Your MTG Dash sign-in link",
    html: [
      `<p>Click to sign in to MTG Dash:</p>`,
      `<p><a href="${url}">Sign in</a></p>`,
      `<p>This link expires in 5 minutes. If you didn't request it, ignore this email.</p>`,
    ].join("\n"),
  });
  if (error) throw new Error(`Failed to send magic link: ${error.message}`);
}

export const auth = betterAuth({
  baseURL: resolveBaseUrl(),
  database: drizzleAdapter(db, {
    provider: "pg",
    // The neon-http driver has no transaction support; the adapter falls back
    // to sequential statements when this is off.
    transaction: false,
  }),
  // 30-day sliding window (same policy as storybook-studio): anyone active at
  // least monthly never sees another magic-link email. updateAge bounds the
  // renewal write to ~once per 15 days per active user.
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 15,
  },
  plugins: [
    magicLink({ sendMagicLink }),
    // Must stay last: rewrites Set-Cookie handling for server actions.
    nextCookies(),
  ],
});
