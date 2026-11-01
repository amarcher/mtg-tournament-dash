import { describe, expect, it } from "vitest";
import {
  BETA_INVITE_SNOOZE_MS,
  isIosBrowser,
  isQuietRoute,
  shouldShowBetaInvite,
} from "./beta-invite";

const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1";
const ipadDesktop =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Safari/605.1.15";
const android =
  "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36";

const base = {
  userAgent: iphone,
  maxTouchPoints: 5,
  isNativeShell: false,
  pathname: "/leagues/friday",
  dismissedAt: null,
  now: 1_700_000_000_000,
};

describe("isIosBrowser", () => {
  it("recognises iPhone and iPad user agents", () => {
    expect(isIosBrowser(iphone, 5)).toBe(true);
    expect(isIosBrowser(iphone.replace("Safari", "CriOS"), 5)).toBe(true);
  });

  it("tells an iPad asking for desktop sites apart from a Mac by touch", () => {
    expect(isIosBrowser(ipadDesktop, 5)).toBe(true);
    expect(isIosBrowser(ipadDesktop, 0)).toBe(false);
  });

  it("ignores Android and desktop", () => {
    expect(isIosBrowser(android, 5)).toBe(false);
  });
});

describe("isQuietRoute", () => {
  it("covers the scorekeeper and the broadcast, not their neighbours", () => {
    expect(isQuietRoute("/events/abc/play")).toBe(true);
    expect(isQuietRoute("/events/abc/broadcast/")).toBe(true);
    expect(isQuietRoute("/events/abc")).toBe(false);
    expect(isQuietRoute("/leagues/playoffs")).toBe(false);
  });
});

describe("shouldShowBetaInvite", () => {
  it("shows to an iPhone browser on an ordinary page", () => {
    expect(shouldShowBetaInvite(base)).toBe(true);
  });

  it("stays out of the native shell, other platforms and quiet routes", () => {
    expect(shouldShowBetaInvite({ ...base, isNativeShell: true })).toBe(false);
    expect(shouldShowBetaInvite({ ...base, userAgent: android })).toBe(false);
    expect(
      shouldShowBetaInvite({ ...base, pathname: "/events/abc/play" })
    ).toBe(false);
  });

  it("snoozes for a month after a dismissal, then asks again", () => {
    const dismissedAt = base.now - BETA_INVITE_SNOOZE_MS + 1;
    expect(shouldShowBetaInvite({ ...base, dismissedAt })).toBe(false);
    expect(
      shouldShowBetaInvite({ ...base, dismissedAt: dismissedAt - 2 })
    ).toBe(true);
  });
});
