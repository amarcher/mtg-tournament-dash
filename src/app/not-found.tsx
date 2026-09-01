import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center px-6 py-12 text-center">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
          Lost in the multiverse
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-100">
          This page doesn&apos;t exist
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          The link may be stale — a game that ended, or a QR from another
          night.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          Back to the homepage
        </Link>
      </div>
    </main>
  );
}
