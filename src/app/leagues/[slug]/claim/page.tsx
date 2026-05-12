import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug, listLeaguePlayers } from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import {
  claimLeaguePlayerAction,
  createLeaguePlayerAction,
} from "@/app/events/actions";

export const dynamic = "force-dynamic";

export default async function LeagueClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ switch?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [roster, me] = await Promise.all([
    listLeaguePlayers(league.id),
    getCurrentLeaguePlayer(league.id),
  ]);

  const switchMode = sp.switch === "1";
  const showBanner = me && !switchMode;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/leagues/${league.slug}`}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← {league.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Pick or create your wizard
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {league.name} · tap an existing wizard or create your own.
        </p>
      </div>

      {showBanner && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <span className="text-emerald-300">
            Claimed as <strong>{me.displayName}</strong>
          </span>
          <Link
            href={`/leagues/${league.slug}`}
            className="ml-auto rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Back to league →
          </Link>
          <Link
            href={`/leagues/${league.slug}/claim?switch=1`}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Switch player
          </Link>
        </div>
      )}

      <section className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-amber-300">
          New here?
        </h2>
        <p className="mb-3 text-xs text-zinc-400">
          Enter your name to create a wizard for {league.name}. You can add a
          selfie portrait on the next screen.
        </p>
        <form action={createLeaguePlayerAction} className="flex gap-2">
          <input type="hidden" name="leagueSlug" value={league.slug} />
          <input
            name="name"
            required
            placeholder="Your name"
            autoComplete="name"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
          >
            Create wizard
          </button>
        </form>
      </section>

      {roster.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
            Returning? Tap your wizard
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {roster.map((p) => (
              <div key={p.id} className="relative">
                <form action={claimLeaguePlayerAction}>
                  <input
                    type="hidden"
                    name="leagueSlug"
                    value={league.slug}
                  />
                  <input type="hidden" name="playerId" value={p.id} />
                  <button
                    type="submit"
                    aria-label={`Claim ${p.displayName}`}
                    className={`group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-zinc-900 text-left transition active:scale-[0.98] ${
                      me?.id === p.id
                        ? "border-emerald-500/60 ring-2 ring-emerald-500/60"
                        : "border-zinc-800 hover:border-amber-500/60"
                    }`}
                  >
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="grid h-20 w-20 place-items-center rounded-full border-2 border-dashed border-amber-500/60 font-mono text-3xl text-amber-400/80">
                          {p.displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                    <div
                      className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-6 text-center text-lg font-semibold tracking-tight text-white"
                      style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}
                    >
                      {p.displayName}
                    </div>
                  </button>
                </form>
                <Link
                  href={`/players/${p.id}`}
                  aria-label={`Re-wizardize ${p.displayName}`}
                  className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-zinc-950/80 text-base text-amber-300 ring-1 ring-amber-400/50 backdrop-blur transition hover:bg-zinc-900 hover:text-amber-200"
                >
                  ↺
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
