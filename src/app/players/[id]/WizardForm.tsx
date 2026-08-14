"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { generateWizardAction } from "@/app/events/actions";
import {
  DEFAULT_PORTRAIT_THEME,
  PORTRAIT_THEMES,
  PORTRAIT_THEME_LABELS,
  THEME_ARCHETYPES,
  THEME_FALLBACK_ARCHETYPE,
  type PortraitTheme,
} from "@/lib/wizard-types";

type Props = {
  playerId: string;
  hasWizard: boolean;
  defaultArchetype: string | null;
  /** Server-side rendered flag: a wizardize job is currently running. */
  generating: boolean;
  /** Error message from the last failed background job, or null. */
  lastError: string | null;
  /** Stored seed selfie from the last generation, reusable for regens. */
  selfieUrl: string | null;
};

export function WizardForm({
  playerId,
  hasWizard,
  defaultArchetype,
  generating,
  lastError,
  selfieUrl,
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
        selfieUrl={selfieUrl}
      />
    </form>
  );
}

function FormBody({
  hasWizard,
  defaultArchetype,
  generating,
  selfieUrl,
}: {
  hasWizard: boolean;
  defaultArchetype: string | null;
  generating: boolean;
  selfieUrl: string | null;
}) {
  const { pending } = useFormStatus();
  const busy = pending || generating;
  const [theme, setTheme] = useState<PortraitTheme>(DEFAULT_PORTRAIT_THEME);
  const [reuseSelfie, setReuseSelfie] = useState(Boolean(selfieUrl));

  const archetypes = THEME_ARCHETYPES[theme];
  const archetypeDefault =
    defaultArchetype && archetypes.includes(defaultArchetype)
      ? defaultArchetype
      : THEME_FALLBACK_ARCHETYPE[theme];

  return (
    <>
      <fieldset
        disabled={busy}
        className="contents disabled:opacity-60"
      >
        <div className="md:col-span-2">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Selfie
          </span>
          {selfieUrl && reuseSelfie ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5">
              <input type="hidden" name="useSavedSelfie" value="1" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selfieUrl}
                alt="Your saved selfie"
                className="h-14 w-14 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 text-sm">
                <div className="font-medium text-emerald-200">
                  Reusing your saved selfie
                </div>
                <button
                  type="button"
                  onClick={() => setReuseSelfie(false)}
                  className="mt-0.5 text-xs text-amber-400 underline-offset-2 hover:text-amber-300 hover:underline"
                >
                  Upload a different photo instead
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                id="wizard-selfie"
                name="selfie"
                type="file"
                required
                accept="image/heic,image/heif,image/jpeg,image/png,image/webp,image/*"
                aria-label="Selfie"
                className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-amber-400 disabled:file:bg-zinc-700"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Required — pick a photo of yourself (iPhone HEIC works).
              </p>
              {selfieUrl && (
                <button
                  type="button"
                  onClick={() => setReuseSelfie(true)}
                  className="mt-1 text-xs text-amber-400 underline-offset-2 hover:text-amber-300 hover:underline"
                >
                  Use my saved selfie instead
                </button>
              )}
            </>
          )}
        </div>
        <div>
          <label htmlFor="wizard-theme" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Theme
          </label>
          <select
            id="wizard-theme"
            name="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as PortraitTheme)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            {PORTRAIT_THEMES.map((t) => (
              <option key={t} value={t}>
                {PORTRAIT_THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="wizard-archetype" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            {theme === "standard" ? "Archetype" : "Character"}
          </label>
          {/* key={theme} remounts the select when the theme flips so the
              defaultValue re-resolves against the new pack. */}
          <select
            key={theme}
            id="wizard-archetype"
            name="archetype"
            defaultValue={archetypeDefault}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            {archetypes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
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
