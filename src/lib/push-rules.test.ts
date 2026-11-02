import { describe, expect, it } from "vitest";
import {
  apnsRequest,
  apnsTokenStale,
  fcmMessage,
  gameNightsNotification,
  isPlausibleToken,
  leagueMessageNotification,
  parseServiceAccount,
  pollNotification,
  prefForKind,
  roundNotification,
  tokenUnregistered,
} from "./push-rules";

const seat = {
  roundNumber: 2,
  eventId: "evt-1",
  eventName: "Friday Draft",
  tableNumber: 3,
  opponentName: "Gandalf",
};

describe("roundNotification", () => {
  it("names the table and opponent and deep-links to the scorekeeper", () => {
    const n = roundNotification(seat, "https://x.test");
    expect(n.title).toBe("Round 2 is starting");
    expect(n.body).toBe("Table 3 vs Gandalf · Friday Draft");
    expect(n.url).toBe("https://x.test/events/evt-1/play");
    expect(n.collapseId).toBe("round-evt-1-2");
  });

  it("says so for a bye", () => {
    const n = roundNotification({ ...seat, opponentName: null });
    expect(n.body).toMatch(/^You have the bye/);
  });
});

describe("leagueMessageNotification", () => {
  it("carries the organizer's text verbatim, collapses per message, and is gated by the messages switch", () => {
    const n = leagueMessageNotification(
      { messageId: "m1", title: "Results are in", body: "See how you did", path: "/leagues/t/standings" },
      "https://x.test"
    );
    expect(n.title).toBe("Results are in");
    expect(n.body).toBe("See how you did");
    expect(n.url).toBe("https://x.test/leagues/t/standings");
    expect(n.collapseId).toBe("msg-m1");
    expect(prefForKind(n.kind)).toBe("notifyMessages");
  });
});

describe("pollNotification", () => {
  it("credits the creator and links to the poll", () => {
    const n = pollNotification({
      creatorName: "Kaia",
      title: "Next draft night",
      optionCount: 3,
      leagueSlug: "home",
      pollId: "p1",
    });
    expect(n.title).toBe("Kaia posted a date poll");
    expect(n.body).toContain("3 nights");
    expect(n.url).toBe("https://mtg.capxun.com/leagues/home/schedule/p1");
  });
});

describe("gameNightsNotification", () => {
  it("leads with the earliest date and counts the rest", () => {
    const n = gameNightsNotification({
      dates: [new Date("2026-11-16T19:00:00-08:00"), new Date("2026-11-02T19:00:00-08:00")],
      leagueSlug: "home",
      leagueName: "Home League",
    });
    expect(n).not.toBeNull();
    expect(n!.title).toBe("New game nights in Home League");
    expect(n!.body).toMatch(/and 1 more date · RSVP$/);
  });

  it("is null for an empty batch", () => {
    expect(
      gameNightsNotification({ dates: [], leagueSlug: "h", leagueName: "H" })
    ).toBeNull();
  });
});

describe("prefForKind", () => {
  it("gates rounds and scheduling separately and never gates the smoke test", () => {
    expect(prefForKind("round_started")).toBe("notifyRounds");
    expect(prefForKind("date_poll")).toBe("notifySchedule");
    expect(prefForKind("game_nights")).toBe("notifySchedule");
    expect(prefForKind("test")).toBeNull();
  });
});

describe("apnsRequest", () => {
  it("sets the topic, collapse id and an absolute expiration", () => {
    const now = new Date(1_700_000_000_000);
    const req = apnsRequest(roundNotification(seat), "com.capxun.mtgdash", now);
    expect(req.headers["apns-topic"]).toBe("com.capxun.mtgdash");
    expect(req.headers["apns-push-type"]).toBe("alert");
    expect(req.headers["apns-collapse-id"]).toBe("round-evt-1-2");
    expect(req.headers["apns-expiration"]).toBe(String(1_700_000_000 + 3600));
    const body = req.body as { aps: { alert: { title: string } }; url: string };
    expect(body.aps.alert.title).toBe("Round 2 is starting");
    expect(body.url).toContain("/events/evt-1/play");
  });
});

describe("fcmMessage", () => {
  it("carries the link in data and names the channel", () => {
    const msg = fcmMessage(roundNotification(seat), "tok") as {
      message: {
        token: string;
        data: { url: string };
        android: { ttl: string; notification: { channel_id: string } };
      };
    };
    expect(msg.message.token).toBe("tok");
    expect(msg.message.data.url).toContain("/events/evt-1/play");
    expect(msg.message.android.ttl).toBe("3600s");
    expect(msg.message.android.notification.channel_id).toBe("mtg-dash");
  });
});

describe("tokenUnregistered", () => {
  it("reads Apple's gone-for-good answers", () => {
    expect(tokenUnregistered("ios", 410, "Unregistered")).toBe(true);
    expect(tokenUnregistered("ios", 400, "BadDeviceToken")).toBe(true);
    expect(tokenUnregistered("ios", 403, "InvalidProviderToken")).toBe(false);
    expect(tokenUnregistered("ios", 500, undefined)).toBe(false);
  });

  it("reads Google's", () => {
    expect(tokenUnregistered("android", 404, "UNREGISTERED")).toBe(true);
    expect(tokenUnregistered("android", 400, "INVALID_ARGUMENT")).toBe(true);
    expect(tokenUnregistered("android", 429, "QUOTA_EXCEEDED")).toBe(false);
  });
});

describe("apnsTokenStale", () => {
  it("turns over after 50 minutes", () => {
    const issued = Date.now();
    expect(apnsTokenStale(issued, new Date(issued + 49 * 60_000))).toBe(false);
    expect(apnsTokenStale(issued, new Date(issued + 51 * 60_000))).toBe(true);
  });
});

describe("isPlausibleToken", () => {
  it("rejects short or whitespace-bearing strings", () => {
    expect(isPlausibleToken("abc")).toBe(false);
    expect(isPlausibleToken("a".repeat(20) + " ")).toBe(false);
    expect(isPlausibleToken("f".repeat(64))).toBe(true);
  });
});

describe("parseServiceAccount", () => {
  const account = {
    client_email: "sender@example.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    project_id: "example",
  };
  const json = JSON.stringify(account, null, 2);

  it("reads the JSON as-is", () => {
    expect(parseServiceAccount(json)).toEqual(account);
  });

  it("reads the JSON base64-encoded", () => {
    expect(parseServiceAccount(btoa(json))).toEqual(account);
  });

  it("rejects junk and incomplete accounts", () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount("{not json")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: "p" }))).toBeNull();
  });
});
