import { describe, expect, it } from "vitest";
import { sharePathFor } from "./share-link";

describe("sharePathFor", () => {
  it("sends every event screen to the player's page", () => {
    expect(sharePathFor("/events/e1/manage")).toBe("/events/e1/play");
    expect(sharePathFor("/events/e1/claim")).toBe("/events/e1/play");
    expect(sharePathFor("/events/e1/play")).toBe("/events/e1/play");
  });
  it("keeps the broadcast view as it is", () => {
    expect(sharePathFor("/events/e1/broadcast")).toBe("/events/e1/broadcast");
  });
  it("keeps the pages players answer on", () => {
    expect(sharePathFor("/leagues/home/schedule")).toBe("/leagues/home/schedule");
    expect(sharePathFor("/leagues/home/schedule/p1")).toBe(
      "/leagues/home/schedule/p1"
    );
    expect(sharePathFor("/leagues/home/schedule/nights/n1")).toBe(
      "/leagues/home/schedule/nights/n1"
    );
    expect(sharePathFor("/leagues/home/standings")).toBe(
      "/leagues/home/standings"
    );
    expect(sharePathFor("/players/p1")).toBe("/players/p1");
    expect(sharePathFor("/matches/m1")).toBe("/matches/m1");
  });
  it("swaps organizer and form screens for the page behind them", () => {
    expect(sharePathFor("/leagues/home/organize")).toBe("/leagues/home");
    expect(sharePathFor("/leagues/home/organize/notify")).toBe("/leagues/home");
    expect(sharePathFor("/leagues/home/settings")).toBe("/leagues/home");
    expect(sharePathFor("/leagues/home/events/new")).toBe("/leagues/home");
    expect(sharePathFor("/leagues/home/claim")).toBe("/leagues/home");
    expect(sharePathFor("/leagues/home/schedule/new")).toBe(
      "/leagues/home/schedule"
    );
    expect(sharePathFor("/leagues/home/schedule/nights/new")).toBe(
      "/leagues/home/schedule"
    );
  });
  it("never shares a path that carries a token", () => {
    expect(sharePathFor("/events/e1/join/secret")).toBeNull();
    expect(sharePathFor("/leagues/home/manage/secret")).toBeNull();
    expect(sharePathFor("/leagues/home/resume/secret")).toBeNull();
    expect(sharePathFor("/leagues/home/invite/secret")).toBeNull();
  });
  it("has nothing to share on creation and account screens", () => {
    expect(sharePathFor("/events/new")).toBeNull();
    expect(sharePathFor("/leagues/new")).toBeNull();
    expect(sharePathFor("/sign-in")).toBeNull();
    expect(sharePathFor("/")).toBe("/");
  });
});
