import { redirect } from "next/navigation";
import { listLeagues } from "@/db/queries";

export const dynamic = "force-dynamic";

// Events are created under a league now. If there's exactly one league, jump
// straight to its event-create form; otherwise bounce to the league chooser.
export default async function LegacyNewEventRedirect() {
  const all = await listLeagues();
  if (all.length === 1) {
    redirect(`/leagues/${all[0].slug}/events/new`);
  }
  redirect("/");
}
