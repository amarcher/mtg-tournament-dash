/**
 * What a page should do when it comes back to the foreground. A home-screen
 * web app (or a native WebView) is suspended rather than closed, so the page
 * that reappears can be hours stale and may have been built by a deployment
 * the server no longer runs.
 */
export const STALE_AFTER_MS = 30_000;

export type ResumeDecision = "none" | "refresh" | "reload";

export function resumeDecision({
  awayMs,
  localId,
  remoteId,
}: {
  awayMs: number;
  localId: string | null;
  remoteId: string | null;
}): ResumeDecision {
  if (awayMs < STALE_AFTER_MS) return "none";
  if (localId && remoteId && remoteId !== localId) return "reload";
  return "refresh";
}
