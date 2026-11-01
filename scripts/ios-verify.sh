#!/usr/bin/env bash
# Preflight for a native iOS build of the MTG Dash shell: the Xcode check, then
# an unsigned simulator build. Run it before archiving in Xcode. macOS only.
#
#   npm run ios:verify
#
# The build SDK decides how the shell looks on the iPhone Duo (on sale
# 2026-10-23): an archive from Xcode 26 or earlier runs letterboxed at phone
# size on the inner screen and sits left of the camera strip on the outer one;
# one from the iOS 27.1 SDK (Xcode 27.1) fills both, with no code change.
# Learned on Crossword Clash, whose builds up to 21 came from Xcode 26.6.
set -euo pipefail

command -v xcodebuild >/dev/null || { echo "ios-verify: xcodebuild not found; this needs macOS with Xcode." >&2; exit 1; }

min_xcode=27.1
xcode=$(xcodebuild -version | sed -n 's/^Xcode \([0-9][0-9.]*\).*/\1/p')
if [[ -z "$xcode" ]] || [[ "$(printf '%s\n' "$min_xcode" "$xcode" | sort -V | head -1)" != "$min_xcode" ]]; then
  echo "ios-verify: Xcode ${xcode:-?} is active; ${min_xcode} or later is needed (full screen on iPhone Duo). Install it, or point xcode-select at it." >&2
  exit 1
fi
echo "ios-verify: Xcode $xcode (iOS ${min_xcode}+ SDK: edge to edge on iPhone Duo)"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
xcodebuild -project "$ROOT/ios/App/App.xcodeproj" -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -configuration Debug build CODE_SIGNING_ALLOWED=NO
