/**
 * Where a URL handed to the native shell should go: a same-origin link is a
 * client navigation (the shell stays on its cookies and its SSE stream),
 * anything else leaves for the system browser. Shared by Universal Links /
 * App Links (NativeLinks) and notification taps (PushEffects) so both land
 * the same way.
 */
export function openAppUrl(
  router: { push: (href: string) => void },
  url: string
) {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return;
  }
  if (target.origin === window.location.origin) {
    router.push(target.pathname + target.search + target.hash);
  } else {
    window.location.assign(url);
  }
}
