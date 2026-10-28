// Server-only by convention, but not `import "server-only"` — that throws
// under the tsx-driven verify harness (same reasoning as wizard-job.ts).
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";
import { db } from "@/db/client";

// Accounts exist for ORGANIZERS only. Players never sign in — their identity
// stays the league_token / join_token cookie scheme in src/lib/auth.ts.

function resolveBaseUrl() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  // Preview deployments: auth requests use the branch alias people actually
  // open (…-git-<branch>-….vercel.app), falling back to the per-deployment
  // URL. Sessions are then scoped per-preview — expected, not a bug.
  if (process.env.VERCEL_BRANCH_URL)
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// better-auth rejects requests whose Origin isn't the baseURL ("Invalid
// origin"). A preview is reachable at both its branch alias and its
// per-deployment URL, so trust both.
const trustedOrigins = [
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_URL,
]
  .filter((host): host is string => Boolean(host))
  .map((host) => `https://${host}`);

// A code instead of a link: an installed home-screen app and the native
// WebView shell each get their own cookie jar, so a link tapped in Mail signs
// in Safari, not the app. A code typed into whichever surface asked for it
// lands the session where the organizer actually is.
async function sendSignInCode({ email, otp }: { email: string; otp: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Local dev without email: the code in the server log IS the sign-in.
    console.log(`[user-auth] sign-in code for ${email}: ${otp}`);
    return;
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "MTG Dash <onboarding@resend.dev>",
    to: email,
    subject: `${otp} is your MTG Dash sign-in code`,
    html: [
      `<p>Enter this code to sign in to MTG Dash:</p>`,
      `<p style="font-size:28px;font-weight:600;letter-spacing:0.2em;font-family:ui-monospace,Menlo,monospace">${otp}</p>`,
      `<p>It expires in 10 minutes. If you didn't request it, ignore this email.</p>`,
    ].join("\n"),
  });
  if (error) throw new Error(`Failed to send sign-in code: ${error.message}`);
}

export const auth = betterAuth({
  baseURL: resolveBaseUrl(),
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    // The neon-http driver has no transaction support; the adapter falls back
    // to sequential statements when this is off.
    transaction: false,
  }),
  // 30-day sliding window (same policy as storybook-studio): anyone active at
  // least monthly never sees another sign-in code email. updateAge bounds the
  // renewal write to ~once per 15 days per active user.
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 15,
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "sign-in") await sendSignInCode({ email, otp });
      },
    }),
    // Must stay last: rewrites Set-Cookie handling for server actions.
    nextCookies(),
  ],
});
