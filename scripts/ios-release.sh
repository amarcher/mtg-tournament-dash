#!/usr/bin/env bash
# Build the MTG Dash iOS shell and upload it to TestFlight, in one go. macOS +
# Xcode only. Modelled on space-race's web/scripts/ios-release.sh.
#
#   npm run ios:release            # archive + export a signed .ipa (no upload)
#   npm run ios:release -- --upload  # ... and upload it to App Store Connect
#
# Signing: the PERSONAL team (J39B2498YF, Andrew Archer). The first build
# uploaded bound com.capxun.mtgdash to it for good, so the LLC team is refused
# below. APPLE_TEAM_ID and the ASC_API_* variables are the ones exported in
# ~/.zshrc (the personal-team set; Fable Reader's FABLE_* set is the other
# team and must not be used here). The App Store Connect API key authenticates
# both the provisioning update and the upload, so no Apple ID session has to
# be alive in Xcode:
#
#   APPLE_TEAM_ID=J39B2498YF ASC_API_KEY_ID=... ASC_API_ISSUER_ID=... npm run ios:release -- --upload
#
# Bump CURRENT_PROJECT_VERSION in ios/App/App.xcodeproj AND NATIVE_BUILDS.ios in
# src/lib/native-version.ts before each upload (the unit test keeps them equal).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/ios/App/App.xcodeproj"
BUILD_DIR="$ROOT/ios/build"
ARCHIVE="$BUILD_DIR/MTGDash.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"
EXPECTED_TEAM="J39B2498YF"   # Andrew Archer (personal). What the bundle id is bound to.
LLC_TEAM="QV6BJ85QXY"        # FABLE DESIGNER LLC — Fable Reader's team. Never this app.

UPLOAD=0
[[ "${1:-}" == "--upload" ]] && UPLOAD=1

command -v xcodebuild >/dev/null || { echo "ios-release: xcodebuild not found; this needs macOS with Xcode." >&2; exit 1; }

# The build SDK decides how the shell looks on the iPhone Duo: an archive from
# Xcode 26 or earlier runs letterboxed at phone size on the inner screen and
# left of the camera strip on the outer one; one from the iOS 27.1 SDK fills
# both with no code change (docs/native-app.md, "iPhone Duo").
min_xcode=27.1
xcode=$(xcodebuild -version | sed -n 's/^Xcode \([0-9][0-9.]*\).*/\1/p')
if [[ -z "$xcode" ]] || [[ "$(printf '%s\n' "$min_xcode" "$xcode" | sort -V | head -1)" != "$min_xcode" ]]; then
  echo "ios-release: Xcode ${xcode:-?} is active; ${min_xcode} or later is needed (full screen on iPhone Duo). Install it, or point xcode-select at it." >&2
  exit 1
fi

TEAM_ID="${APPLE_TEAM_ID:-}"
if [[ -z "$TEAM_ID" ]]; then
  echo "ios-release: set APPLE_TEAM_ID=$EXPECTED_TEAM (the personal team this bundle id is bound to)." >&2; exit 1
elif [[ "$TEAM_ID" == "$LLC_TEAM" ]]; then
  echo "ios-release: APPLE_TEAM_ID is the Fable Designer LLC team; com.capxun.mtgdash belongs to $EXPECTED_TEAM." >&2; exit 1
elif [[ "$TEAM_ID" != "$EXPECTED_TEAM" ]]; then
  echo "ios-release: APPLE_TEAM_ID is $TEAM_ID, expected $EXPECTED_TEAM. If the team really changed, update EXPECTED_TEAM here and in docs/native-app.md." >&2; exit 1
fi

# The build number the shell will report, and the one the site must serve
# (src/lib/native-version.ts) for installed shells to learn about this build.
build=$(sed -n 's/.*CURRENT_PROJECT_VERSION = \([0-9]*\);.*/\1/p' "$PROJECT/project.pbxproj" | sort -u)
served=$(sed -n 's/.*NATIVE_BUILDS = { ios: \([0-9]*\),.*/\1/p' "$ROOT/src/lib/native-version.ts")
if [[ "$(echo "$build" | wc -l | tr -d ' ')" != "1" || "$build" != "$served" ]]; then
  echo "ios-release: CURRENT_PROJECT_VERSION ($build) and NATIVE_BUILDS.ios ($served) disagree; bump them together." >&2; exit 1
fi
echo "==> Xcode $xcode, team $TEAM_ID, build $build"

echo "==> Syncing the Capacitor iOS project"
(cd "$ROOT" && npx cap sync ios)

# Provisioning updates and the upload authenticated by the App Store Connect
# API key (AuthKey_<ID>.p8 in ~/.appstoreconnect/private_keys), never by an
# Apple ID session, which expires silently mid-archive.
AUTH_ARGS=()
if [[ -n "${ASC_API_KEY_ID:-}" && -n "${ASC_API_ISSUER_ID:-}" ]]; then
  ASC_KEY_PATH="${ASC_API_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_API_KEY_ID}.p8}"
  if [[ -f "$ASC_KEY_PATH" ]]; then
    AUTH_ARGS=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_API_KEY_ID" -authenticationKeyIssuerID "$ASC_API_ISSUER_ID")
    echo "==> Signing auth: App Store Connect API key $ASC_API_KEY_ID"
  else
    echo "!! ASC_API_KEY_ID set but $ASC_KEY_PATH is missing — falling back to Xcode's Apple ID session" >&2
  fi
fi

# -exportArchive refuses a non-empty export path with a bare EXPORT FAILED, so
# every run starts clean.
rm -rf "$ARCHIVE" "$EXPORT_DIR"
mkdir -p "$BUILD_DIR"

echo "==> Archiving (signed, team $TEAM_ID)"
xcodebuild -project "$PROJECT" -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive \
  -allowProvisioningUpdates "${AUTH_ARGS[@]}" \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM_ID"

EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"
cat > "$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>teamID</key>
	<string>$TEAM_ID</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>uploadSymbols</key>
	<true/>
	<key>destination</key>
	<string>export</string>
</dict>
</plist>
PLIST

echo "==> Exporting the .ipa"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR" -allowProvisioningUpdates "${AUTH_ARGS[@]}"
ipa=$(ls "$EXPORT_DIR"/*.ipa)
echo "==> $ipa"

# Read the team back off the payload: the signature decides which account this
# build belongs to, whatever the inputs said.
verify="$BUILD_DIR/verify"; rm -rf "$verify"; mkdir -p "$verify"
unzip -q "$ipa" -d "$verify"
signer=$(codesign -dvv "$verify"/Payload/*.app 2>&1 | sed -n 's/^Authority=\(Apple Distribution: .*\)/\1/p' | head -1)
echo "==> Signed by: ${signer:-?}"
if [[ "$signer" != *"($EXPECTED_TEAM)"* ]]; then
  echo "ios-release: the .ipa is not signed by team $EXPECTED_TEAM; not uploading." >&2; exit 1
fi

if [[ "$UPLOAD" -eq 1 ]]; then
  : "${ASC_API_KEY_ID:?Set ASC_API_KEY_ID (App Store Connect API key ID; .p8 in ~/.appstoreconnect/private_keys)}"
  : "${ASC_API_ISSUER_ID:?Set ASC_API_ISSUER_ID (App Store Connect API issuer ID)}"
  echo "==> Uploading build $build to App Store Connect (API key $ASC_API_KEY_ID)"
  xcrun altool --upload-app -f "$ipa" -t ios --apiKey "$ASC_API_KEY_ID" --apiIssuer "$ASC_API_ISSUER_ID"
  echo "==> Uploaded. TestFlight distributes it once Apple finishes processing; deploy the NATIVE_BUILDS bump so installed shells hear about it."
else
  echo "    Re-run with --upload to send it to App Store Connect."
fi
