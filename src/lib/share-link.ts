import { Capacitor } from "@capacitor/core";

/**
 * Which path a "share this page" tap should send to other people. An
 * organizer is usually standing on an organizer-only screen when they want to
 * text the group, so those map to the page players should land on; a path
 * that carries a secret token is never shareable. Pure, so it is unit-tested.
 */

// Segments followed by a per-person or per-league secret.
const TOKEN_SEGMENTS = new Set(["join", "resume", "invite", "manage"]);

export function sharePathFor(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "/";

  const tokenAt = parts.findIndex((p) => TOKEN_SEGMENTS.has(p));
  if (tokenAt !== -1 && tokenAt < parts.length - 1) return null;

  if (parts[0] === "events") {
    if (parts.length < 2 || parts[1] === "new") return null;
    // Broadcast is the TV view and reads fine on its own; every other event
    // screen shares /play, which sends a visitor to claim a seat, to their
    // table, or to the final ranking, whichever the event is up to.
    if (parts[2] === "broadcast") return `/events/${parts[1]}/broadcast`;
    return `/events/${parts[1]}/play`;
  }

  if (parts[0] === "leagues") {
    if (parts.length < 2 || parts[1] === "new") return null;
    const league = `/leagues/${parts[1]}`;
    const section = parts[2];
    if (section === "schedule") {
      const leaf = parts[3] === "nights" ? parts[4] : parts[3];
      return leaf === "new" ? `${league}/schedule` : `/${parts.join("/")}`;
    }
    if (section === "standings") return `${league}/standings`;
    // Organize, settings, new-event and claim screens: share the league home.
    return league;
  }

  if (parts[0] === "players" || parts[0] === "matches") {
    return parts.length === 2 ? `/${parts.join("/")}` : null;
  }

  return null;
}

export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

/**
 * Hands a link to the OS share sheet: the native plugin in a shell that has
 * it (the Android WebView has no Web Share of its own), Web Share in mobile
 * browsers and older iOS shells. Anywhere else the link is copied.
 */
export async function shareLink(link: {
  title: string;
  url: string;
}): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Share")) {
    // Imported lazily so the web bundle never evaluates the plugin.
    const { Share } = await import("@capacitor/share");
    try {
      await Share.share(link);
      return "shared";
    } catch (err) {
      if (/cancel/i.test(err instanceof Error ? err.message : String(err))) {
        return "dismissed";
      }
    }
  } else if (typeof navigator.share === "function") {
    try {
      await navigator.share(link);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "dismissed";
      }
    }
  }
  try {
    await navigator.clipboard.writeText(link.url);
    return "copied";
  } catch {
    return "failed";
  }
}
