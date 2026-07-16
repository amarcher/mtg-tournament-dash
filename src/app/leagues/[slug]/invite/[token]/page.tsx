import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppChrome } from "@/app/components/AppChrome";
import { acceptManagerInviteAction } from "@/app/events/actions";
import { getLeagueBySlug, getLeagueMembership } from "@/db/queries";
import { getSessionUser } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function ManagerInvitePage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const valid =
    league.managerInviteToken !== null && league.managerInviteToken === token;

  if (!valid) {
    return (
      <AppChrome league={league}>
        <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
            <h1 className="text-xl font-semibold tracking-tight">
              Invite link expired
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              This manager invite for {league.name} is no longer valid — ask
              the league owner for a fresh link.
            </p>
            <Link
              href={`/leagues/${league.slug}`}
              className="mt-6 inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Back to {league.name}
            </Link>
          </div>
        </main>
      </AppChrome>
    );
  }

  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/leagues/${slug}/invite/${token}`)}`
    );
  }

  const membership = await getLeagueMembership(league.id, user.id);
  const alreadyManager =
    membership !== null || league.ownerUserId === user.id;

  return (
    <AppChrome league={league}>
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-amber-500/40 bg-amber-500/10 text-2xl">
            🧙
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Manage {league.name}
          </h1>
          {alreadyManager ? (
            <>
              <p className="mt-2 text-sm text-zinc-400">
                You already manage this league.
              </p>
              <Link
                href={`/leagues/${league.slug}`}
                className="mt-6 inline-block rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400"
              >
                Open {league.name}
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-zinc-400">
                You&apos;ve been invited to co-manage this league as{" "}
                <strong>{user.email}</strong> — run events, pair rounds, and
                edit the roster.
              </p>
              <form action={acceptManagerInviteAction} className="mt-6">
                <input type="hidden" name="leagueSlug" value={league.slug} />
                <input type="hidden" name="token" value={token} />
                <button
                  type="submit"
                  className="w-full rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                >
                  Join as organizer
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </AppChrome>
  );
}
