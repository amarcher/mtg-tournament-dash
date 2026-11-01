"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  BETA_INVITE_DISMISS_KEY,
  shouldShowBetaInvite,
  TESTFLIGHT_PUBLIC_LINK,
} from "@/lib/beta-invite";

function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(BETA_INVITE_DISMISS_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Invites iPhone and iPad visitors to the TestFlight build. Decided in an
 * effect from the real user agent, so the server renders nothing and
 * hydration never mismatches; the decision itself is `shouldShowBetaInvite`.
 */
export function BetaInvite() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Deferred so the first client render matches the server's (nothing), and
    // the banner slides in after paint instead of flashing during hydration.
    const id = window.setTimeout(() => {
      setVisible(
        shouldShowBetaInvite({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints ?? 0,
          isNativeShell: Capacitor.isNativePlatform(),
          pathname,
          dismissedAt: readDismissedAt(),
        })
      );
    }, 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(BETA_INVITE_DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode: it asks again next visit */
    }
    setVisible(false);
  };

  return (
    <aside
      aria-label="Get the iPhone app"
      className="fixed inset-x-[calc(1rem+env(safe-area-inset-left))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-[14px] border border-line bg-surface p-4 shadow-e3 motion-safe:animate-[sheet-up_260ms_var(--ease-out-expo)]"
    >
      <p className="text-sm leading-snug text-ink">
        <span className="font-semibold">MTG Dash for iPhone</span> is in
        TestFlight. Get a buzz when your round is paired.
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-ink-dim btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          Not now
        </button>
        <a
          href={TESTFLIGHT_PUBLIC_LINK}
          onClick={dismiss}
          className="inline-flex min-h-11 items-center rounded-md btn-gold px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          Join the beta
        </a>
      </div>
    </aside>
  );
}
