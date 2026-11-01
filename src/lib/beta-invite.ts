/**
 * The website's invitation to install the iPhone app. Apple's Smart App Banner
 * only works for App Store apps, and MTG Dash is TestFlight-only, so this is a
 * banner of our own: shown to iPhone and iPad browsers, never inside the
 * native shell, never mid-game, and snoozed for a month once dismissed.
 */

export const TESTFLIGHT_PUBLIC_LINK =
  "https://testflight.apple.com/join/GTwRXEyY";

export const BETA_INVITE_DISMISS_KEY = "mtg_beta_invite_dismissed_at";

export const BETA_INVITE_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export interface BetaInviteContext {
  userAgent: string;
  maxTouchPoints: number;
  isNativeShell: boolean;
  pathname: string;
  dismissedAt: number | null;
  now?: number;
}

export function isIosBrowser(userAgent: string, maxTouchPoints: number) {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS asks for desktop sites, so Safari there reports a Mac; a Mac with
  // a touch screen is an iPad.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** Routes where no banner may appear: a phone mid-game or a TV broadcast. */
export function isQuietRoute(pathname: string) {
  return /\/(play|broadcast)(\/|$)/.test(pathname);
}

export function shouldShowBetaInvite(ctx: BetaInviteContext): boolean {
  if (ctx.isNativeShell) return false;
  if (!isIosBrowser(ctx.userAgent, ctx.maxTouchPoints)) return false;
  if (isQuietRoute(ctx.pathname)) return false;
  const now = ctx.now ?? Date.now();
  if (ctx.dismissedAt !== null && now - ctx.dismissedAt < BETA_INVITE_SNOOZE_MS)
    return false;
  return true;
}
