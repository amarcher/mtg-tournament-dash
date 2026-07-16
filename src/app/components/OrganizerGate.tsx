import Link from "next/link";
import type { League } from "@/db/schema";
import { AppChrome } from "@/app/components/AppChrome";

/**
 * Rendered in place of organizer-only pages when the visitor has neither a
 * manager session nor the organizer-token cookie. Keeps the URL stable so
 * signing in can land right back here.
 */
export function OrganizerGate({
  league,
  next,
}: {
  league: Pick<League, "name" | "slug"> | null;
  next: string;
}) {
  return (
    <AppChrome league={league}>
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-amber-500/40 bg-amber-500/10 text-2xl">
            🔒
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Organizer access required
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            This page is for league managers. Sign in with a manager account,
            or open it through the organizer link your host shared.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={`/sign-in?next=${encodeURIComponent(next)}`}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              Sign in
            </Link>
            {league && (
              <Link
                href={`/leagues/${league.slug}`}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
              >
                Back to {league.name}
              </Link>
            )}
          </div>
        </div>
      </main>
    </AppChrome>
  );
}
