// The build number each store currently serves. Bump together with
// ios/App/App.xcodeproj (CURRENT_PROJECT_VERSION) and android/app/build.gradle
// (versionCode); the unit test fails if the three disagree. The deploy that
// carries the bump is what tells installed shells an update exists.
export const NATIVE_BUILDS = { ios: 4, android: 2 } as const;

export type NativePlatform = keyof typeof NATIVE_BUILDS;

// Custom schemes rather than https so the WebView hands them to the OS instead
// of navigating. iOS opens TestFlight while the app is beta-only; switch to
// itms-apps://apps.apple.com/app/id6827733846 once a version is on the store.
export const STORE_URLS: Record<NativePlatform, string> = {
  ios: "itms-beta://beta.itunes.apple.com/v1/app/6827733846",
  android: "market://details?id=com.capxun.mtgdash",
};

export function isNativePlatform(p: string): p is NativePlatform {
  return p === "ios" || p === "android";
}

/** `installed` is what @capacitor/app reports: CFBundleVersion on iOS,
 * versionCode on Android, both as strings. */
export function updateAvailable(installed: string, latest: number): boolean {
  const n = Number.parseInt(installed, 10);
  return Number.isFinite(n) && n < latest;
}
