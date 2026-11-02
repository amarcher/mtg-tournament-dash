"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { registerPushDeviceAction } from "@/app/events/actions";
import {
  checkPushPermission,
  obtainPushToken,
  pushPlatform,
  pushSupported,
  requestPushPermission,
  storedPushToken,
} from "@/lib/push-client";
import {
  ENROLL_DELAY_MS,
  markAsked,
  readAskedAt,
  shouldAutoEnroll,
} from "@/lib/push-enroll";

/**
 * Turns notifications on for a phone the first time it opens a league it
 * has a wizard in. Renders nothing. Mounted only where the server knows the
 * visitor holds a league identity, so a browsing stranger is never
 * prompted; the switches to turn kinds off again live on the player's own
 * page. Once a token is stored, PushEffects owns re-registration.
 */
export function PushEnroll() {
  useEffect(() => {
    if (!pushSupported() || storedPushToken()) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const permission = await checkPushPermission();
        if (!shouldAutoEnroll({ permission, askedAt: readAskedAt() })) return;
        if (permission !== "granted") markAsked();
        if ((await requestPushPermission()) !== "granted" || cancelled) return;
        const [token, info] = await Promise.all([
          obtainPushToken(),
          App.getInfo().catch(() => null),
        ]);
        if (cancelled || !token) return;
        await registerPushDeviceAction({
          token,
          platform: pushPlatform(),
          appBuild: info?.build ?? null,
        });
      } catch {
        /* offline or no store answer: the next league visit tries again */
      }
    }, ENROLL_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
