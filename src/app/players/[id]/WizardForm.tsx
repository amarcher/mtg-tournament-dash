"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { generateWizardAction } from "@/app/events/actions";
import { WIZARD_ARCHETYPES } from "@/lib/wizard-types";

export type WizardTheme = {
  /** Event whose portraitTheme the server re-reads on submit. */
  eventId: string;
  /** Short label for the checkbox, e.g. the draft's set name. */
  label: string;
  /** The theme description itself, shown so players know what they get. */
  description: string;
};

type Props = {
  playerId: string;
  hasWizard: boolean;
  defaultArchetype: string | null;
  /** Server-side rendered flag: a wizardize job is currently running. */
  generating: boolean;
  /** Error message from the last failed background job, or null. */
  lastError: string | null;
  /** Upcoming draft's portrait theme, when its event has one. */
  theme?: WizardTheme | null;
};

export function WizardForm({
  playerId,
  hasWizard,
  defaultArchetype,
  generating,
  lastError,
  theme = null,
}: Props) {
  const router = useRouter();

  // While the background job is running, poll the page every 4 s so the
  // avatar appears as soon as the DB row updates. ~25 polls max for a 90 s
  // job; cheap RSC re-renders.
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [generating, router]);

  // Hide the prior failure banner while a fresh attempt is in flight so the
  // user doesn't read a stale error alongside the spinner.
  const showError = !generating && lastError;

  return (
    <form
      action={generateWizardAction}
      className="grid gap-4 md:grid-cols-2"
      encType="multipart/form-data"
    >
      <input type="hidden" name="playerId" value={playerId} />
      {showError && (
        <div
          role="alert"
          className="md:col-span-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <div className="font-semibold">Last generation failed</div>
          <div className="mt-1 break-words font-mono text-xs text-red-100/90">
            {lastError}
          </div>
        </div>
      )}
      <FormBody
        hasWizard={hasWizard}
        defaultArchetype={defaultArchetype}
        generating={generating}
        theme={theme}
      />
    </form>
  );
}

function FormBody({
  hasWizard,
  defaultArchetype,
  generating,
  theme,
}: {
  hasWizard: boolean;
  defaultArchetype: string | null;
  generating: boolean;
  theme: WizardTheme | null;
}) {
  const { pending } = useFormStatus();
  const busy = pending || generating;
  const [useTheme, setUseTheme] = useState(theme !== null);

  return (
    <>
      <fieldset
        disabled={busy}
        className="contents disabled:opacity-60"
      >
        <div className="md:col-span-2">
          <label htmlFor="wizard-selfie" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Selfie
          </label>
          <input
            id="wizard-selfie"
            name="selfie"
            type="file"
            required
            accept="image/heic,image/heif,image/jpeg,image/png,image/webp,image/*"
            className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-amber-400 disabled:file:bg-zinc-700"
          />
        </div>
        {theme && (
          <div className="md:col-span-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <input
                type="checkbox"
                checked={useTheme}
                onChange={(e) => setUseTheme(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-amber-500"
              />
              {useTheme && (
                <input type="hidden" name="themeEventId" value={theme.eventId} />
              )}
              <span className="min-w-0 text-sm">
                <span className="font-semibold text-amber-200">
                  Match this draft: {theme.label}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-400">
                  Your portrait becomes {theme.description} — instead of the
                  wizard archetype below.
                </span>
              </span>
            </label>
          </div>
        )}
        <div className={useTheme ? "opacity-40" : undefined}>
          <label htmlFor="wizard-archetype" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Archetype{useTheme ? " (unused with draft theme)" : ""}
          </label>
          <select
            id="wizard-archetype"
            name="archetype"
            defaultValue={defaultArchetype ?? "archmage"}
            disabled={useTheme}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            {WIZARD_ARCHETYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="wizard-freeform" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Extra detail (optional)
          </label>
          <input
            id="wizard-freeform"
            name="freeform"
            placeholder="e.g. red beard, raven on shoulder"
            maxLength={140}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-500/40 disabled:text-zinc-950/60"
        >
          {busy && (
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="3"
                strokeOpacity="0.3"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          )}
          {pending
            ? "Sending selfie…"
            : generating
              ? "Painting 5 portraits…"
              : hasWizard
                ? "Re-generate wizard"
                : "Generate wizard portrait"}
        </button>
        <span className="text-xs text-zinc-500">
          {generating
            ? "Painting 5 portraits in the background — about 2½ minutes. You can leave this page; the new wizard will appear on refresh."
            : "~2½ min on the local FLUX server (5 tier portraits: fresh, wounded, critical, victory, defeat)."}
        </span>
      </div>
    </>
  );
}
