"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

// Universal Links / App Links hand the native shell a URL; without this the
// app just comes to the foreground on whatever page it was already showing.
export function NativeLinks() {
  const router = useRouter();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = App.addListener("appUrlOpen", ({ url }) => {
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
    });
    return () => {
      void sub.then((s) => s.remove());
    };
  }, [router]);
  return null;
}
