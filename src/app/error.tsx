"use client";

/**
 * Styled catch-all for uncaught server errors. Production redacts the real
 * message (a digest is all we get), so expected failures should surface
 * inline via useActionState — this page is the safety net that keeps a
 * surprise from looking like a dead 404 (Aug 31 draft night).
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center px-6 py-12 text-center">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
          A wild counterspell
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-100">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          That last move fizzled. Your game state is safe — go back and try
          again, and tell the organizer if it keeps happening.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Go back
          </button>
        </div>
      </div>
    </main>
  );
}
