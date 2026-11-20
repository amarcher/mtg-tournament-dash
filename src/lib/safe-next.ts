/**
 * A `next` return target that is safe to redirect to: a path on this site and
 * nothing else. Browsers read `\` as `/` and drop tabs and newlines when they
 * resolve a URL, so `/\evil.test` and `/<tab>/evil.test` leave the site just
 * like `//evil.test` does.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const next = raw.trim();
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return null;
  return next;
}
