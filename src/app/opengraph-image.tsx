import { ImageResponse } from "next/og";

export const alt =
  "MTG Dash — house tournaments with broadcast view, phone scorekeeping, and AI wizard portraits";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#09090b";
const AMBER_500 = "#f59e0b";
const AMBER_300 = "#fcd34d";
const ZINC_300 = "#d4d4d8";
const ZINC_500 = "#71717a";

/**
 * Default site OG — shown for unfurls on /, /leagues/*, and any route that
 * doesn't have its own opengraph-image. Pure typography over an amber radial
 * accent; no DB queries so this is statically optimized at build time.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          color: "#fafafa",
          padding: "70px 80px",
          justifyContent: "space-between",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          backgroundImage:
            "radial-gradient(circle at 75% 40%, rgba(245, 158, 11, 0.18), transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 20,
              color: AMBER_500,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
            }}
          >
            House Magic, dashboarded
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontSize: 168,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "#fafafa",
            }}
          >
            MTG Dash
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: ZINC_300,
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
              maxWidth: 920,
            }}
          >
            Swiss pairings · live life totals on a TV · AI wizard portraits
            that take damage.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 8,
              fontSize: 18,
              color: ZINC_500,
              letterSpacing: "0.04em",
            }}
          >
            Built for kitchen-table tournaments.
          </div>
        </div>

        {/* Decorative pip ribbon along the right edge — six dots matching the
            broadcast view's standings strip aesthetic. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: 60,
            top: 0,
            bottom: 0,
            flexDirection: "column",
            justifyContent: "center",
            gap: 14,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: i === 1 ? AMBER_300 : i <= 3 ? AMBER_500 : "#3f3f46",
                opacity: i <= 3 ? 1 : 0.6,
              }}
            />
          ))}
        </div>
      </div>
    ),
    size
  );
}
