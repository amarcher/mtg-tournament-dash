import Link from "next/link";
import type { Event, League } from "@/db/schema";

type Props = {
  event: Pick<Event, "id" | "name" | "status">;
  league?: Pick<League, "name" | "slug"> | null;
  active: "manage" | "claim" | "broadcast" | "play";
};

const item =
  "rounded-md px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70";
const selected = "bg-zinc-800 text-zinc-50";

export function EventNav({ event, league, active }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-zinc-900 pb-4">
      {league ? (
        <Link href={`/leagues/${league.slug}`} className={item}>
          {league.name}
        </Link>
      ) : (
        <Link href="/" className={item}>
          Home
        </Link>
      )}
      <span className="text-zinc-700">/</span>
      <span className="mr-1 truncate text-sm text-zinc-500">{event.name}</span>
      <div className="flex flex-wrap gap-1">
        <Link
          href={`/events/${event.id}/manage`}
          className={`${item} ${active === "manage" ? selected : ""}`}
        >
          Manage
        </Link>
        <Link
          href={`/events/${event.id}/claim`}
          className={`${item} ${active === "claim" ? selected : ""}`}
        >
          Claim
        </Link>
        <Link
          href={`/events/${event.id}/broadcast`}
          target="_blank"
          className={`${item} ${active === "broadcast" ? selected : ""}`}
        >
          Broadcast
        </Link>
        <Link
          href={`/events/${event.id}/play`}
          className={`${item} ${active === "play" ? selected : ""}`}
        >
          Scorekeeper
        </Link>
      </div>
    </div>
  );
}
