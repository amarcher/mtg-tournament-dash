import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent, getEventRoster } from "@/db/queries";
import { getCurrentPlayer } from "@/lib/auth";
import { claimIdentityAction } from "@/app/events/actions";

export const dynamic = "force-dynamic";

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ switch?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();

  const [roster, me] = await Promise.all([
    getEventRoster(id),
    getCurrentPlayer(id),
  ]);

  // "Switch player" toggle: when the user lands here already claimed, we show
  // the banner. Tapping "Switch player" re-renders without the banner so the
  // grid is the only thing competing for the eye.
  const switchMode = sp.switch === "1";
  const showBanner = me && !switchMode;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tap your wizard to claim your seat.
        </p>
      </div>

      {showBanner && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <span className="text-emerald-300">
            Claimed as <strong>{me.displayName}</strong>
          </span>
          <Link
            href={`/events/${id}/play`}
            className="ml-auto rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Continue to play →
          </Link>
          <Link
            href={`/events/${id}/claim?switch=1`}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Switch player
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {roster.map((p) => (
          <div key={p.playerId} className="relative">
            <form action={claimIdentityAction}>
              <input type="hidden" name="eventId" value={id} />
              <input type="hidden" name="playerId" value={p.playerId} />
              <button
                type="submit"
                aria-label={`Claim ${p.displayName}`}
                className={`group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-zinc-900 text-left transition active:scale-[0.98] ${
                  me?.playerId === p.playerId
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
            {/* Regen badge — sits OUTSIDE the form so tapping it doesn't
                submit the claim. z-10 keeps it above the card image. */}
            <Link
              href={`/players/${p.playerId}`}
              aria-label={`Re-wizardize ${p.displayName}`}
              className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-zinc-950/80 text-base text-amber-300 ring-1 ring-amber-400/50 backdrop-blur transition hover:bg-zinc-900 hover:text-amber-200"
            >
              ↺
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-zinc-500">
        Don&apos;t see your face? Ask the organizer for your join link.
      </p>
    </main>
  );
}
