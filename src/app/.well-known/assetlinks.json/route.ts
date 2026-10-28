// Android App Links counterpart of apple-app-site-association. Three
// certificates because three different keys sign builds of this package:
// Play re-signs store builds with its own app-signing key, the upload key
// signs the .aab we hand Play, and the debug key signs sideloaded dev builds.
const FINGERPRINTS = [
  "76:77:07:3D:E1:01:98:5A:AD:14:1D:2E:65:F6:E7:AD:20:7B:00:3D:2F:44:92:05:D2:A0:A2:1C:53:22:A8:64", // Play app signing key
  "E2:B8:19:D4:87:49:73:70:CA:4D:A2:3D:1B:EA:9D:6B:B2:02:CE:1C:22:77:B6:E1:16:A2:20:C0:A2:F6:1C:FD", // upload key (~/.mtg-dash)
  "D4:1A:93:54:1F:EC:8F:C4:87:EE:BC:13:F6:9B:4B:17:0D:E3:DA:0C:F8:0A:9C:40:11:C6:D8:C2:72:43:EB:90", // debug key (~/.android)
];

export function GET() {
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.capxun.mtgdash",
          sha256_cert_fingerprints: FINGERPRINTS,
        },
      },
    ],
    { headers: { "cache-control": "public, max-age=3600" } }
  );
}
