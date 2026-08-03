import { notFound } from "next/navigation";
import { AppChrome } from "@/app/components/AppChrome";
import { OrganizerGate } from "@/app/components/OrganizerGate";
import { SignOutButton } from "@/app/components/SignOutButton";
import {
  removeLeagueMemberAction,
  rotateManagerInviteTokenAction,
  rotateOrganizerTokenAction,
} from "@/app/events/actions";
import { getLeagueBySlug, listLeagueMembers } from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { getSessionUser, isLeagueOrganizer } from "@/lib/authz";
import { getPublicBaseUrl } from "@/lib/public-url";
import { qrDataUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

export default async function LeagueSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  if (!(await isLeagueOrganizer(league))) {
    return <OrganizerGate league={league} next={`/leagues/${slug}/settings`} />;
  }

  const [members, me, sessionUser, baseUrl] = await Promise.all([
    listLeagueMembers(league.id),
    getCurrentLeaguePlayer(league.id),
    getSessionUser(),
    getPublicBaseUrl(),
  ]);

  const organizerUrl = league.organizerToken
    ? `${baseUrl}/leagues/${league.slug}/manage/${league.organizerToken}`
    : null;
  const inviteUrl = league.managerInviteToken
    ? `${baseUrl}/leagues/${league.slug}/invite/${league.managerInviteToken}`
    : null;
  const [organizerQr, inviteQr] = await Promise.all([
    organizerUrl ? qrDataUrl(organizerUrl) : null,
    inviteUrl ? qrDataUrl(inviteUrl) : null,
  ]);

  return (
    <AppChrome league={league} player={me} isOrganizer active="settings">
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          League settings
        </h1>
        <p className="mb-8 text-sm text-zinc-500">
          {league.name} · manager access and sharing links.
        </p>

        <section className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
              Managers
            </h2>
            {sessionUser && <SignOutButton email={sessionUser.email} />}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Signed-in accounts that can run events, pair rounds, and edit the
            roster. Players don&apos;t need any of this — they just tap their
            wizard.
          </p>
          {members.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              No manager accounts yet — this league is run via the organizer
              link below{league.ownerUserId ? "" : ", or claim it by signing in and using the manager invite"}.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/60 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.name || m.email}
                      {sessionUser?.id === m.userId && (
                        <span className="ml-2 text-xs text-emerald-300">
                          you
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {m.email}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      m.role === "owner"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400"
                    }`}
                  >
                    {m.role}
                  </span>
                  {league.ownerUserId !== m.userId && (
                    <form action={removeLeagueMemberAction}>
                      <input type="hidden" name="leagueId" value={league.id} />
                      <input type="hidden" name="userId" value={m.userId} />
                      <button
                        type="submit"
                        className="rounded-md border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10"
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            Manager invite link
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Send this to a co-organizer. They sign in with their email and
            join as a manager. Rotating it invalidates the old link.
          </p>
          {inviteUrl && (
            <ShareLink url={inviteUrl} qr={inviteQr} label="manager invite" />
          )}
          <form action={rotateManagerInviteTokenAction} className="mt-3">
            <input type="hidden" name="leagueId" value={league.id} />
            <button
              type="submit"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Rotate invite link
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-amber-300">
            Organizer link
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            The no-login escape hatch: opening this link unlocks the manage
            pages on that device — no account needed. Handy for the TV or a
            trusted phone. Rotating it kicks every device that used the old
            link (including saved cookies).
          </p>
          {organizerUrl && (
            <ShareLink url={organizerUrl} qr={organizerQr} label="organizer" />
          )}
          <form action={rotateOrganizerTokenAction} className="mt-3">
            <input type="hidden" name="leagueId" value={league.id} />
            <button
              type="submit"
              className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/10"
            >
              Rotate organizer link
            </button>
          </form>
        </section>
      </main>
    </AppChrome>
  );
}

function ShareLink({
  url,
  qr,
  label,
}: {
  url: string;
  qr: string | null;
  label: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4">
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt={`QR code for the ${label} link`}
          className="h-28 w-28 rounded-lg border border-zinc-700 bg-white p-1.5"
        />
      )}
      <code className="min-w-0 flex-1 break-all rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">
        {url}
      </code>
    </div>
  );
}
