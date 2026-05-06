"use client";

import { useFormStatus } from "react-dom";
import { generateWizardAction } from "@/app/events/actions";
import { WIZARD_ARCHETYPES } from "@/lib/wizard-types";

type Props = {
  playerId: string;
  hasWizard: boolean;
  defaultArchetype: string | null;
};

export function WizardForm({
  playerId,
  hasWizard,
  defaultArchetype,
}: Props) {
  return (
    <form
      action={generateWizardAction}
      className="grid gap-4 md:grid-cols-2"
      encType="multipart/form-data"
    >
      <input type="hidden" name="playerId" value={playerId} />
      <FormBody
        hasWizard={hasWizard}
        defaultArchetype={defaultArchetype}
      />
    </form>
  );
}

function FormBody({
  hasWizard,
  defaultArchetype,
}: {
  hasWizard: boolean;
  defaultArchetype: string | null;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <fieldset
        disabled={pending}
        className="contents disabled:opacity-60"
      >
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Selfie
          </label>
          <input
            name="selfie"
            type="file"
            required
            accept="image/heic,image/heif,image/jpeg,image/png,image/webp,image/*"
            className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-amber-400 disabled:file:bg-zinc-700"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Archetype
          </label>
          <select
            name="archetype"
            defaultValue={defaultArchetype ?? "archmage"}
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
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Extra detail (optional)
          </label>
          <input
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
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-500/40 disabled:text-zinc-950/60"
        >
          {pending && (
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
            ? "Painting 3 portraits…"
            : hasWizard
              ? "Re-generate wizard"
              : "Generate wizard portrait"}
        </button>
        <span className="text-xs text-zinc-500">
          {pending
            ? "Painting 3 portraits — about 90 seconds. Don’t navigate away."
            : "~90 s on the local FLUX server (3 tier portraits)."}
        </span>
      </div>
    </>
  );
}
