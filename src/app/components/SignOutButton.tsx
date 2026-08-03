"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { deauthorizeDeviceAction } from "@/app/events/actions";

/**
 * Signs out the better-auth session AND drops the no-login organizer
 * cookies — either alone leaves the device with organizer power. Rendered
 * even without a session so a device unlocked via the organizer link can be
 * de-authorized too.
 */
export function SignOutButton({ email }: { email?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const label = email ? "Sign out" : "De-authorize this device";

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await deauthorizeDeviceAction();
          if (email) await authClient.signOut();
          router.push("/");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
      title={email ? `Sign out of ${email}` : "Remove organizer access from this device"}
    >
      {busy ? "Working…" : label}
    </button>
  );
}
