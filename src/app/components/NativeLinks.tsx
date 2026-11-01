"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { openAppUrl } from "@/lib/app-url";

// Universal Links / App Links hand the native shell a URL; without this the
// app just comes to the foreground on whatever page it was already showing.
export function NativeLinks() {
  const router = useRouter();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = App.addListener("appUrlOpen", ({ url }) =>
      openAppUrl(router, url)
    );
    return () => {
      void sub.then((s) => s.remove());
    };
  }, [router]);
  return null;
}
