import type { PushPermission } from "@/lib/push-client";

/**
 * Notifications are on by default in the shell: the first time a phone with
 * a league identity opens a league page, the OS prompt is shown without a
 * tap. The pure decision lives here so the rule is testable; PushEnroll
 * does the asking. A phone is asked once (iOS only ever shows the prompt
 * once anyway), and one that already allowed notifications but lost its
 * stored token is registered again without a prompt.
 */

/** localStorage: when this phone was first asked, so it is never asked twice. */
export const PUSH_ASKED_KEY = "mtg_push_asked_at";
/** Let the page land before the prompt covers it. */
export const ENROLL_DELAY_MS = 1500;

export function shouldAutoEnroll(input: {
  permission: PushPermission;
  askedAt: number | null;
}): boolean {
  if (input.permission === "denied") return false;
  if (input.permission === "granted") return true;
  return input.askedAt === null;
}

export function readAskedAt(): number | null {
  try {
    const raw = localStorage.getItem(PUSH_ASKED_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function markAsked(now: number = Date.now()) {
  try {
    localStorage.setItem(PUSH_ASKED_KEY, String(now));
  } catch {
    /* private mode: the next launch may ask again, which the OS dedupes */
  }
}
