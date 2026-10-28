"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import {
  isNativePlatform,
  STORE_URLS,
  updateAvailable,
  type NativePlatform,
} from "@/lib/native-version";

type Pending = { platform: NativePlatform; latest: number };

const dismissKey = (p: Pending) =>
  `mtg_update_dismissed_${p.platform}_${p.latest}`;

function wasDismissed(p: Pending) {
  try {
    return localStorage.getItem(dismissKey(p)) !== null;
  } catch {
    return false;
  }
}

/**
 * TestFlight and Play both push a "new build" notification, but a tester who
 * swipes it away never sees it again. In the native shell only, this asks the
 * server which build each store serves now and offers the update in-app. It
 * re-checks on every return to the foreground; dismissing is per build, so the
 * next build asks again.
 */
export function NativeUpdate() {
  const pathname = usePathname();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const platform = Capacitor.getPlatform();
    if (!isNativePlatform(platform)) return;

    let cancelled = false;
    const check = async () => {
      try {
        const [info, res] = await Promise.all([
          App.getInfo(),
          fetch("/api/native-version", { cache: "no-store" }),
        ]);
        const latest = ((await res.json()) as Record<NativePlatform, number>)[
          platform
        ];
        if (cancelled || !updateAvailable(info.build, latest)) return;
        const next = { platform, latest };
        setPending(wasDismissed(next) ? null : next);
      } catch {
        /* offline — the next foreground re-checks */
      }
    };
    void check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Never interrupt a phone mid-game or a TV on the broadcast view.
  if (!pending || /\/(play|broadcast)(\/|$)/.test(pathname)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(pending), "1");
    } catch {
      /* private mode — it just asks again next launch */
    }
    setPending(null);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+4.25rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-[14px] border border-line bg-surface p-3 pl-4 shadow-e3 motion-safe:animate-[sheet-up_260ms_var(--ease-out-expo)]"
    >
      <p className="min-w-0 flex-1 text-sm text-ink">
        A newer MTG Dash is ready to install.
      </p>
      <a
        href={STORE_URLS[pending.platform]}
        className="rounded-md btn-gold px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
      >
        Update
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-dim btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
      >
        ×
      </button>
    </div>
  );
}
