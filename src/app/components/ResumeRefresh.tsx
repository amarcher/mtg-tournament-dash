"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resumeDecision, STALE_AFTER_MS } from "@/lib/resume";

/**
 * A home-screen web app (and a native WebView) is suspended, not closed, so
 * reopening it shows whatever was on screen when it was put away — hours or
 * days stale, with no address bar or pull-to-refresh to recover from. On every
 * return to the foreground this re-fetches the current route, and does a full
 * reload when the server is running a newer deployment than this page came
 * from.
 */
export function ResumeRefresh({
  deploymentId,
}: {
  deploymentId: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    let hiddenAt: number | null = null;

    const resume = async (awayMs: number) => {
      if (awayMs < STALE_AFTER_MS) return;
      let remoteId: string | null = null;
      if (deploymentId) {
        try {
          const res = await fetch("/api/version", { cache: "no-store" });
          remoteId = ((await res.json()) as { id: string | null }).id;
        } catch {
          /* offline — the refresh below reconciles once we're back */
        }
      }
      const decision = resumeDecision({
        awayMs,
        localId: deploymentId,
        remoteId,
      });
      if (decision === "reload") {
        // At most one reload per deployment id, so a version check answered by
        // some other deployment can't bounce the page forever.
        const key = `mtg_reloaded_for_${remoteId}`;
        let already = false;
        try {
          already = sessionStorage.getItem(key) !== null;
          sessionStorage.setItem(key, "1");
        } catch {
          /* private mode or blocked storage — reload once anyway */
        }
        if (!already) {
          window.location.reload();
          return;
        }
      }
      router.refresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt === null) return;
      const awayMs = Date.now() - hiddenAt;
      hiddenAt = null;
      void resume(awayMs);
    };
    // Safari restores pages from the back/forward cache without firing
    // visibilitychange; the age of such a page is unknown, so treat it as stale.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void resume(Infinity);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [deploymentId, router]);

  return null;
}
