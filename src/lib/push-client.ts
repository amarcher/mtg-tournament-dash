import { Capacitor } from "@capacitor/core";
import { PUSH_CHANNEL_ID } from "@/lib/push-rules";

/**
 * The browser side of push: a thin wrapper over @capacitor/push-notifications
 * that only ever does anything inside the native shell. On the website, and
 * in a shell built before the plugin existed (`isPluginAvailable` is false
 * there), every function is a no-op that reports "unsupported", so the UI
 * renders nothing and nothing asks the OS for permission.
 *
 * The plugin is imported lazily so the web bundle never evaluates it, and no
 * promise here resolves with the plugin object itself: a Capacitor plugin is
 * a Proxy that answers `then`, so such a promise would never settle.
 */

type PushModule = typeof import("@capacitor/push-notifications");

export type PushPermission = "granted" | "denied" | "prompt";

/** localStorage: the token this phone last registered, so a relaunch re-registers without re-asking. */
export const PUSH_TOKEN_KEY = "mtg_push_token";

export function pushSupported(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("PushNotifications")
  );
}

export function pushPlatform(): "ios" | "android" {
  return Capacitor.getPlatform() === "ios" ? "ios" : "android";
}

let sdk: Promise<PushModule> | null = null;
function loadSdk(): Promise<PushModule> {
  if (!sdk) sdk = import("@capacitor/push-notifications");
  return sdk;
}

function toPermission(state: string): PushPermission {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "prompt";
}

export async function checkPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "denied";
  const m = await loadSdk();
  return toPermission((await m.PushNotifications.checkPermissions()).receive);
}

/** Shows the OS prompt. iOS only ever shows it once; after a denial this returns "denied" straight away. */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "denied";
  const m = await loadSdk();
  return toPermission(
    (await m.PushNotifications.requestPermissions()).receive
  );
}

/**
 * Ask the store for this phone's token. Resolves null when the store never
 * answers (`registrationError`, or 10 s of silence — a simulator, say).
 */
export async function obtainPushToken(): Promise<string | null> {
  if (!pushSupported()) return null;
  const m = await loadSdk();
  const push = m.PushNotifications;
  if (pushPlatform() === "android") {
    // The channel FCM messages name has to exist on the device before the
    // first one arrives, or Android drops it silently.
    await push
      .createChannel({ id: PUSH_CHANNEL_ID, name: "MTG Dash", importance: 4 })
      .catch(() => undefined);
  }
  const token = await new Promise<string | null>((resolve) => {
    let settled = false;
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      for (const h of handles) void h.then((x) => x.remove());
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 10_000);
    handles.push(push.addListener("registration", (t) => done(t.value)));
    handles.push(push.addListener("registrationError", () => done(null)));
    push.register().catch(() => done(null));
  });
  if (token) {
    try {
      localStorage.setItem(PUSH_TOKEN_KEY, token);
    } catch {
      /* private mode: the next launch asks the store again */
    }
  }
  return token;
}

export function storedPushToken(): string | null {
  try {
    return localStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function forgetStoredPushToken() {
  try {
    localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    /* nothing to forget */
  }
}

/**
 * A tap on a notification hands its `url` to `handle`. Returns a stop
 * function; a no-op outside the shell.
 */
export function startPushTaps(handle: (url: string) => void): () => void {
  if (!pushSupported()) return () => {};
  let stopped = false;
  const listener = loadSdk().then((m) =>
    m.PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
      if (stopped) return;
      const url = (a.notification.data as { url?: unknown } | undefined)?.url;
      if (typeof url === "string") handle(url);
    })
  );
  return () => {
    stopped = true;
    listener.then((h) => h.remove()).catch(() => undefined);
  };
}
