"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { registerPushDeviceAction } from "@/app/events/actions";
import { openAppUrl } from "@/lib/app-url";
import {
  checkPushPermission,
  obtainPushToken,
  pushPlatform,
  pushSupported,
  startPushTaps,
  storedPushToken,
} from "@/lib/push-client";

/**
 * The shell's push plumbing with no screen of its own. A phone that already
 * allowed notifications re-registers on launch, on every return to the
 * foreground and after a navigation (tokens rotate, `last_seen_at` is what
 * the retention sweep reads, and a newly claimed league only gets linked by
 * re-registering). It never asks for permission: only the Notifications
 * card does that. A tap on a notification lands where its link says,
 * through the same path as a Universal Link.
 */
export function PushEffects() {
  const router = useRouter();
  const pathname = usePathname();
  const lastRegisteredAt = useRef(0);

  useEffect(() => {
    if (!pushSupported() || !storedPushToken()) return;
    let cancelled = false;
    const register = async (force: boolean) => {
      // A navigation re-registers at most every 15 s; launch and foreground
      // always do, since a claim or a new build is most likely to have
      // happened across one of those.
      if (!force && Date.now() - lastRegisteredAt.current < 15_000) return;
      try {
        if ((await checkPushPermission()) !== "granted") return;
        const [token, info] = await Promise.all([
          obtainPushToken(),
          App.getInfo().catch(() => null),
        ]);
        if (cancelled || !token) return;
        lastRegisteredAt.current = Date.now();
        await registerPushDeviceAction({
          token,
          platform: pushPlatform(),
          appBuild: info?.build ?? null,
        });
      } catch {
        /* offline — the next foreground retries */
      }
    };
    void register(lastRegisteredAt.current === 0);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void register(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  useEffect(
    () => startPushTaps((url) => openAppUrl(router, url)),
    [router]
  );

  return null;
}
