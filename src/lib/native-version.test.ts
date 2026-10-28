import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NATIVE_BUILDS, updateAvailable } from "./native-version";

describe("updateAvailable", () => {
  it("flags an older installed build", () => {
    expect(updateAvailable("2", 3)).toBe(true);
  });

  it("is quiet on the current or a newer build", () => {
    expect(updateAvailable("3", 3)).toBe(false);
    expect(updateAvailable("4", 3)).toBe(false);
  });

  it("is quiet when the installed build is unreadable", () => {
    expect(updateAvailable("dev", 3)).toBe(false);
    expect(updateAvailable("", 3)).toBe(false);
  });
});

describe("NATIVE_BUILDS matches the native projects", () => {
  it("ios CURRENT_PROJECT_VERSION", () => {
    const pbx = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
    const versions = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(
      (m) => Number(m[1])
    );
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([NATIVE_BUILDS.ios]));
  });

  it("android versionCode", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    expect(Number(/versionCode (\d+)/.exec(gradle)?.[1])).toBe(
      NATIVE_BUILDS.android
    );
  });
});
