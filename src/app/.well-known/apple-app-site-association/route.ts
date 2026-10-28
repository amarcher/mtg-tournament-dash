// Universal Links: a tapped mtg.capxun.com link opens the native shell when
// it's installed, so sign-in codes, claim links and QR codes land inside the
// app's own cookie jar. The shell navigates to the URL in NativeLinks.tsx.
const APP_ID = "J39B2498YF.com.capxun.mtgdash";

export function GET() {
  return Response.json(
    {
      applinks: {
        details: [
          {
            appIDs: [APP_ID],
            components: [
              { "/": "/api/*", exclude: true },
              { "/": "/files/*", exclude: true },
              { "/": "*" },
            ],
          },
        ],
      },
    },
    { headers: { "cache-control": "public, max-age=3600" } }
  );
}
