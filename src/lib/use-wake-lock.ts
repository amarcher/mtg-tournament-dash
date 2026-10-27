"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";

/**
 * Keep the phone's screen on while a game screen is mounted.
 *
 * A single request on mount isn't enough on iOS Safari: it can reject a
 * request made without a recent tap, and it drops the lock whenever the tab
 * is hidden or the OS decides to (low power, a notification sheet). So we
 * re-request on becoming visible *and* on every tap while the lock isn't
 * held — life-total taps happen constantly mid-game, so the lock comes back
 * almost immediately. Silently no-ops where the API is missing (older
 * browsers, or plain-http LAN mode, which isn't a secure context).
 *
 * Inside the native shell the web API is still only a request the OS may
 * refuse (Low Power Mode, for one), so there we also hold the platform's own
 * idle-timer override for as long as the screen is mounted.
 */
export function useWakeLock() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void KeepAwake.keepAwake().catch(() => {});
    return () => {
      void KeepAwake.allowSleep().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let cancelled = false;

    const held = () => sentinel !== null && !sentinel.released;

    const acquire = async () => {
      if (cancelled || pending || held()) return;
      if (document.visibilityState !== "visible") return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
      } catch {
        /* no recent user gesture, low-power mode, or permission policy */
      } finally {
        pending = false;
      }
    };

    const onVisibility = () => void acquire();
    const onTap = () => void acquire();

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerup", onTap, { passive: true });
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerup", onTap);
      void sentinel?.release().catch(() => {});
    };
  }, []);
}
