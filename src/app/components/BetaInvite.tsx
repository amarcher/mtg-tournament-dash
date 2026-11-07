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

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Invites iPhone and iPad visitors to the TestFlight build with a strip drawn
 * like Apple's Smart App Banner (icon, name, subtitle, a blue pill, close),
 * which Apple only offers App Store apps. It sits in flow above the page and
 * scrolls away with it, as Apple's does. Decided in an effect from the real
 * user agent, so the server renders nothing and hydration never mismatches;
 * the decision itself is `shouldShowBetaInvite`.
 */
export function BetaInvite() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Deferred so the first client render matches the server's (nothing).
    const id = window.setTimeout(() => {
      setVisible(
        shouldShowBetaInvite({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints ?? 0,
          isNativeShell: Capacitor.isNativePlatform(),
          isStandalone: isStandalone(),
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
      className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3 font-[system-ui]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a route-generated PNG; next/image would re-encode it */}
      <img
        src="/apple-icon"
        alt=""
        width={56}
        height={56}
        className="size-14 shrink-0 rounded-[13px] ring-1 ring-white/10"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-ink">
          MTG Dash
        </p>
        <p className="line-clamp-2 text-[13px] leading-snug text-ink-dim">
          Get a buzz when your round is paired
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <a
          href={TESTFLIGHT_PUBLIC_LINK}
          onClick={dismiss}
          className="inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-full bg-[#0a7cff] px-4 text-[15px] font-semibold text-white active:bg-[#0062d6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          Get
        </a>
        <span className="text-[10px] leading-tight text-ink-dim">
          TestFlight beta
        </span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="-mr-1.5 grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
      >
        <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-[#0a7cff] active:bg-line">
          <svg
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </span>
      </button>
    </aside>
  );
}
