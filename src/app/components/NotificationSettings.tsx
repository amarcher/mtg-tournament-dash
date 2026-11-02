"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import {
  registerPushDeviceAction,
  setPushPrefsAction,
  unregisterPushDeviceAction,
} from "@/app/events/actions";
import {
  checkPushPermission,
  forgetStoredPushToken,
  obtainPushToken,
  pushPlatform,
  pushSupported,
  requestPushPermission,
  storedPushToken,
  type PushPermission,
} from "@/lib/push-client";

type Prefs = {
  notifyRounds: boolean;
  notifySchedule: boolean;
  notifyMessages: boolean;
};

type State =
  | { phase: "hidden" }
  | { phase: "off"; permission: PushPermission }
  | { phase: "on"; token: string; prefs: Prefs };

/**
 * The player's notification switches, shown only inside the native shell,
 * on their own page. Phones are enrolled by PushEnroll when they first open
 * a league, so this card is mostly where kinds get turned off; its "Turn
 * on" button is the way back for a phone that was never asked (a private
 * window, a store that never answered) or turned everything off here.
 * After an OS-level denial the card says where to allow notifications.
 */
export function NotificationSettings() {
  const [state, setState] = useState<State>({ phase: "hidden" });
  const [busy, setBusy] = useState(false);

  // Server-rendered as hidden; the shell reveals it once the OS has answered,
  // so the website never pays for the plugin and hydration never mismatches.
  useEffect(() => {
    if (!pushSupported()) return;
    let live = true;
    void (async () => {
      const permission = await checkPushPermission();
      const token = storedPushToken();
      if (permission !== "granted" || !token) {
        if (live) setState({ phase: "off", permission });
        return;
      }
      try {
        const prefs = await registerPushDeviceAction({
          token,
          platform: pushPlatform(),
          appBuild: (await App.getInfo().catch(() => null))?.build ?? null,
        });
        if (live) setState({ phase: "on", token, prefs });
      } catch {
        if (live) setState({ phase: "off", permission });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (state.phase === "hidden") return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      const permission = await requestPushPermission();
      if (permission !== "granted") {
        setState({ phase: "off", permission });
        return;
      }
      const token = await obtainPushToken();
      if (!token) {
        setState({ phase: "off", permission: "prompt" });
        return;
      }
      const prefs = await registerPushDeviceAction({
        token,
        platform: pushPlatform(),
        appBuild: (await App.getInfo().catch(() => null))?.build ?? null,
      });
      setState({ phase: "on", token, prefs });
    } finally {
      setBusy(false);
    }
  };

  const setPref = async (patch: Partial<Prefs>) => {
    if (state.phase !== "on") return;
    setBusy(true);
    try {
      const prefs = await setPushPrefsAction({ token: state.token, ...patch });
      setState({ ...state, prefs });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (state.phase !== "on") return;
    setBusy(true);
    try {
      await unregisterPushDeviceAction({ token: state.token });
      forgetStoredPushToken();
      setState({ phase: "off", permission: "granted" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="notifications-heading"
      aria-busy={busy || undefined}
      className="rounded-panel border border-line bg-surface p-5"
    >
      <h2 id="notifications-heading" className="label-caps text-gold">
        Notifications
      </h2>
      <p className="mt-2 text-sm text-ink-dim">
        A buzz when your round is paired, when someone posts dates to answer,
        and when your organizer sends the league a note. Each one is a switch
        here, for this phone.
      </p>

      {state.phase === "off" && state.permission === "denied" && (
        <p className="mt-4 text-sm text-ink-dim">
          Notifications are turned off for MTG Dash in your phone&apos;s
          Settings. Allow them there, then come back here.
        </p>
      )}

      {state.phase === "off" && state.permission !== "denied" && (
        <button
          type="button"
          onClick={() => void turnOn()}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 items-center rounded-[8px] px-4 py-2.5 text-base btn-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-50"
        >
          Turn on notifications
        </button>
      )}

      {state.phase === "on" && (
        <div className="mt-4 flex flex-col divide-y divide-line">
          <SwitchRow
            id="notify-rounds"
            title="Round pairings"
            hint="Your table and opponent the moment a round starts."
            checked={state.prefs.notifyRounds}
            disabled={busy}
            onChange={(on) => void setPref({ notifyRounds: on })}
          />
          <SwitchRow
            id="notify-schedule"
            title="Dates to answer"
            hint="New date polls and game nights in your leagues."
            checked={state.prefs.notifySchedule}
            disabled={busy}
            onChange={(on) => void setPref({ notifySchedule: on })}
          />
          <SwitchRow
            id="notify-messages"
            title="Notes from your organizer"
            hint="One-off reminders: RSVP, results are in, bring snacks."
            checked={state.prefs.notifyMessages}
            disabled={busy}
            onChange={(on) => void setPref({ notifyMessages: on })}
          />
          <div className="pt-3">
            <button
              type="button"
              onClick={() => void turnOff()}
              disabled={busy}
              className="min-h-11 rounded-md px-3 text-sm text-ink-dim btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-50"
            >
              Turn off on this phone
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SwitchRow({
  id,
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex min-h-14 items-center gap-4 py-3">
      <span className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block font-semibold leading-snug">
          {title}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-ink-dim">
          {hint}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-50 ${
          checked ? "bg-amber-500" : "bg-line-strong"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-1 size-6 rounded-full bg-white shadow transition-[left] ${
            checked ? "left-[24px]" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
