import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  getPlayerForUser,
  listLeaguePlayers,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { getSessionUser } from "@/lib/authz";
import {
  claimCard,
  claimDecision,
  createDecision,
  parseClaimPolicy,
} from "@/lib/wizard-ownership";
import { getOrganizerView } from "@/lib/organizer-mode";
import {
  claimLeaguePlayerAction,
  createLeaguePlayerAction,
} from "@/app/events/actions";
import { AppChrome } from "@/app/components/AppChrome";
import { TakeWizardConfirm } from "@/app/components/TakeWizardConfirm";

export const dynamic = "force-dynamic";

export default async function LeagueClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    switch?: string;
    event?: string;
    next?: string;
    take?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  // Carried from an event claim page (the TV QR): after creating a wizard,
  // createLeaguePlayerAction also grabs a seat in this event if still draft.
  const returnEventId = sp.event ?? "";
  // Return target after claiming (e.g. the bonus-game page whose QR routed
  // an unrecognized phone through here). Validated server-side in actions.
  const returnPath = sp.next ?? "";
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [roster, me, view, sessionUser] = await Promise.all([
    listLeaguePlayers(league.id),
    getCurrentLeaguePlayer(league.id),
    getOrganizerView(league),
    getSessionUser(),
  ]);
  const policy = parseClaimPolicy(league.claimPolicy);
  const ownedPlayerId = sessionUser
    ? ((await getPlayerForUser(league.id, sessionUser.id))?.id ?? null)
    : null;
  const viewer = {
    policy,
    sessionUserId: sessionUser?.id ?? null,
    ownedPlayerId,
    isOrganizer: view.isOrganizer,
  };
  const creating = createDecision(viewer);
  const carried = new URLSearchParams();
  if (returnEventId) carried.set("event", returnEventId);
  if (returnPath) carried.set("next", returnPath);
  const selfHref = `/leagues/${league.slug}/claim${carried.size ? `?${carried}` : ""}`;
  const signInHref = `/sign-in?next=${encodeURIComponent(selfHref)}`;

  // Set by the claim action when a tap would make the wizard this account's.
  const asked = sp.take ? roster.find((p) => p.id === sp.take) : undefined;
  const askedDecision = asked
    ? claimDecision({ ...viewer, playerId: asked.id, ownerUserId: asked.userId })
    : null;
  const taking =
    asked && sessionUser && askedDecision?.ok && askedDecision.takeOwnership
      ? asked
      : null;

  const switchMode = sp.switch === "1";
  const showBanner = me && !switchMode;

  return (
    <AppChrome
      league={league}
      player={me}
      isOrganizer={view.isOrganizer}
      organizerMode={view.organizerMode}
    >
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6">
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
            className="ml-auto rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            Back to league →
          </Link>
          <Link
            href={`/leagues/${league.slug}/claim?switch=1`}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Switch player
          </Link>
        </div>
      )}

      {taking && sessionUser && (
        <TakeWizardConfirm
          action={claimLeaguePlayerAction}
          fields={{
            leagueSlug: league.slug,
            playerId: taking.id,
            ...(returnPath ? { next: returnPath } : {}),
          }}
          wizardName={taking.displayName}
          accountEmail={sessionUser.email}
          cancelHref={selfHref}
        />
      )}

      {!creating.ok && creating.reason === "sign_in" && (
        <section className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-amber-300">
            Sign in to join {league.name}
          </h2>
          <p className="mb-3 text-xs text-zinc-400">
            Wizards here belong to accounts. Sign in with your email, then
            take your wizard or create a new one.
          </p>
          <Link
            href={signInHref}
            className="inline-block rounded-md btn-gold px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Sign in
          </Link>
        </section>
      )}

      {creating.ok && (
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
          {returnEventId && (
            <input type="hidden" name="eventId" value={returnEventId} />
          )}
          {returnPath && (
            <input type="hidden" name="next" value={returnPath} />
          )}
          <label htmlFor="league-claim-name" className="sr-only">
            Your name
          </label>
          <input
            id="league-claim-name"
            name="name"
            required
            placeholder="Your name"
            autoComplete="name"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md btn-gold px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Create wizard
          </button>
        </form>
      </section>
      )}

      {roster.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
            Returning? Tap your wizard
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {roster.map((p) => {
              const card = claimCard(
                claimDecision({ ...viewer, playerId: p.id, ownerUserId: p.userId })
              );
              return (
              <div key={p.id} className="relative">
                <form action={claimLeaguePlayerAction}>
                  <input
                    type="hidden"
                    name="leagueSlug"
                    value={league.slug}
                  />
                  <input type="hidden" name="playerId" value={p.id} />
                  {returnPath && (
                    <input type="hidden" name="next" value={returnPath} />
                  )}
                  <button
                    type="submit"
                    aria-label={`Claim ${p.displayName}`}
                    disabled={card.locked}
                    className={`group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-zinc-900 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
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
                    {card.label && (
                      <span className="label-caps absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1.5 text-zinc-200">
                        {card.label}
                      </span>
                    )}
                  </button>
                </form>
              </div>
              );
            })}
          </div>
        </>
      )}
      <p className="mt-8 text-center text-xs text-zinc-500">
        {me ? (
          <>
            Need to update your portrait?{" "}
            <Link
              href={`/players/${me.id}`}
              className="text-amber-400 underline underline-offset-2 transition hover:text-amber-300 active:text-amber-300"
            >
              Open your wizard profile →
            </Link>
          </>
        ) : (
          "Need to update your portrait? Claim your wizard first, then open your wizard profile."
        )}
      </p>
      </main>
    </AppChrome>
  );
}
