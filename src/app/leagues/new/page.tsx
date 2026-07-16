import { redirect } from "next/navigation";
import { AppChrome } from "@/app/components/AppChrome";
import { createLeagueAction } from "@/app/events/actions";
import { getSessionUser } from "@/lib/authz";
import { SlugField } from "./SlugField";

export const dynamic = "force-dynamic";

export default async function NewLeaguePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/leagues/new");

  return (
    <AppChrome>
      <main className="mx-auto w-full max-w-md px-4 py-12">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          Create your league
        </h1>
        <p className="mb-8 text-sm text-zinc-500">
          A league is your group&apos;s home: its players, events, and
          leaderboard. Leagues are unlisted — sharing the link is the invite.
        </p>
        <form action={createLeagueAction} className="flex flex-col gap-4">
          <SlugField />
          <button
            type="submit"
            className="rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Create league
          </button>
          <p className="text-xs text-zinc-500">
            Signed in as {user.email}. You&apos;ll be the league owner and can
            invite co-managers from the settings page.
          </p>
        </form>
      </main>
    </AppChrome>
  );
}
