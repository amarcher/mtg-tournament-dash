import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getEvent, getEventStandings, getLeague } from "@/db/queries";

export const alt = "MTG Dash tournament results";
export const size = { width: 1200, height: 630 };
// `next/og` only emits PNG, and at 1200×630 with photographic content the
// PNG runs ~1 MB — Slack's inline-render cutoff. We post-process to JPEG
// (see jpegFromImageResponse below), so advertise that in the meta tag.
export const contentType = "image/jpeg";

// Re-revalidate hourly so re-shares pick up post-event patches (e.g. the
// May 12 manual outcome fix) without the original Slack/iMessage unfurl
// going stale forever. OG scrapers cache the URL themselves once fetched, so
// 1h here mostly governs the first-share-after-edit case.
export const revalidate = 3600;

const BG = "#09090b";
const CARD_BG = "#18181b";
const ZINC_500 = "#71717a";
const ZINC_400 = "#a1a1aa";
const ZINC_300 = "#d4d4d8";
const ZINC_200 = "#e4e4e7";
const AMBER_300 = "#fcd34d";
const AMBER_500 = "#f59e0b";
const AMBER_700 = "#b45309";
const EMERALD_400 = "#34d399";
const RED_400 = "#f87171";

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function rankColor(rank: number, isLast: boolean) {
  if (isLast) return RED_400;
  if (rank === 1) return AMBER_300;
  if (rank === 2) return ZINC_200;
  if (rank === 3) return AMBER_700;
  return ZINC_500;
}

type Tiers = {
  fresh: string | null;
  wounded: string | null;
  critical: string | null;
  victory: string | null;
  defeat: string | null;
};

function pickAvatar(tiers: Tiers, mode: "victory" | "defeat" | "fresh") {
  if (mode === "victory") {
    return tiers.victory ?? tiers.fresh ?? tiers.wounded ?? tiers.critical ?? null;
  }
  if (mode === "defeat") {
    return tiers.defeat ?? tiers.critical ?? tiers.wounded ?? tiers.fresh ?? null;
  }
  return tiers.fresh ?? tiers.wounded ?? tiers.critical ?? tiers.victory ?? null;
}

function absolutize(baseUrl: string, path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${baseUrl}${path}`;
}

// `next/og` only emits PNG. At 1200×630 with photographic content the PNG
// is ~1 MB, which Slack refuses to inline-render (showing the URL + file
// size instead of a preview). Re-encode the final canvas as JPEG with sharp
// so the output lands ~150-250KB and unfurls cleanly.
async function jpegFromImageResponse(
  response: ImageResponse
): Promise<Response> {
  const png = Buffer.from(await response.arrayBuffer());
  const jpeg = await sharp(png)
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const headers = new Headers(response.headers);
  headers.set("content-type", "image/jpeg");
  headers.set("content-length", String(jpeg.byteLength));
  return new Response(new Uint8Array(jpeg), {
    status: response.status,
    headers,
  });
}

// Pre-resize avatars before embedding so the intermediate PNG buffer
// (which we have to allocate before JPEG-compressing) stays small.
async function inlineAvatarDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(input)
      .rotate()
      .resize({ width: 500, height: 850, fit: "cover" })
      .jpeg({ quality: 75 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const baseUrl =
    process.env.PUBLIC_URL?.replace(/\/+$/, "") ?? "https://mtg.capxun.com";

  const event = await getEvent(id);
  if (!event) {
    return renderBranded("Tournament not found");
  }

  const league = await getLeague(event.leagueId);
  const leagueLabel = league?.name ?? "MTG Dash";

  if (event.status !== "complete") {
    return renderStatusCard({
      title: event.name,
      subtitle: leagueLabel,
      statusLabel:
        event.status === "active" ? "Tournament in progress" : "Tournament upcoming",
    });
  }

  const standings = await getEventStandings(id);
  if (standings.length === 0) {
    return renderStatusCard({
      title: event.name,
      subtitle: leagueLabel,
      statusLabel: "Final results",
    });
  }

  // Build the podium: top 3 (or fewer) plus the last-place finisher when there
  // are at least 4 distinct players. With 3 or fewer players the bottom of the
  // podium *is* the last place, so we don't double-stamp.
  const total = standings.length;
  const top3 = standings.slice(0, Math.min(3, total));
  const podium = top3.map((s, i) => ({
    rank: i + 1,
    name: s.displayName,
    record: `${s.wins}-${s.losses}${s.draws > 0 ? `-${s.draws}` : ""}`,
    avatar: absolutize(
      baseUrl,
      pickAvatar(
        {
          fresh: s.avatarUrl,
          wounded: s.avatarWoundedUrl,
          critical: s.avatarCriticalUrl,
          victory: s.avatarVictoryUrl,
          defeat: s.avatarDefeatUrl,
        },
        i === 0 ? "victory" : "fresh"
      )
    ),
    isLast: false,
  }));
  if (total >= 4) {
    const last = standings[total - 1];
    podium.push({
      rank: total,
      name: last.displayName,
      record: `${last.wins}-${last.losses}${last.draws > 0 ? `-${last.draws}` : ""}`,
      avatar: absolutize(
        baseUrl,
        pickAvatar(
          {
            fresh: last.avatarUrl,
            wounded: last.avatarWoundedUrl,
            critical: last.avatarCriticalUrl,
            victory: last.avatarVictoryUrl,
            defeat: last.avatarDefeatUrl,
          },
          "defeat"
        )
      ),
      isLast: true,
    });
  }

  await Promise.all(
    podium.map(async (p) => {
      p.avatar = await inlineAvatarDataUri(p.avatar);
    })
  );

  return jpegFromImageResponse(new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          color: ZINC_200,
          padding: "32px 40px",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingBottom: 16,
            borderBottom: `1px solid #27272a`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 60,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#fafafa",
              }}
            >
              {event.name}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 18,
                color: ZINC_400,
                letterSpacing: "0.04em",
              }}
            >
              {leagueLabel}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 16,
              fontWeight: 700,
              color: AMBER_500,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              paddingBottom: 8,
            }}
          >
            Final Results
          </div>
        </div>

        {/* Podium */}
        <div
          style={{
            display: "flex",
            flex: 1,
            gap: 16,
            marginTop: 24,
          }}
        >
          {podium.map((p) => (
            <PodiumCard key={p.rank} {...p} />
          ))}
        </div>
      </div>
    ),
    size
  ));
}

function PodiumCard({
  rank,
  name,
  record,
  avatar,
  isLast,
}: {
  rank: number;
  name: string;
  record: string;
  avatar: string | null;
  isLast: boolean;
}) {
  const isChampion = rank === 1;
  const borderColor = isChampion
    ? AMBER_500
    : isLast
      ? "#7f1d1d"
      : "#27272a";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        position: "relative",
        background: CARD_BG,
        borderRadius: 16,
        border: `2px solid ${borderColor}`,
        overflow: "hidden",
      }}
    >
      {/* Portrait — fills the card; if missing, fall back to an initial circle */}
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            width={300}
            height={510}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "flex",
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              background: "#0c0c0e",
              color: AMBER_500,
              fontSize: 120,
              fontWeight: 700,
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Rank badge — top-left corner */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 12,
            left: 12,
            padding: "6px 14px",
            background: "rgba(9,9,11,0.85)",
            borderRadius: 10,
            fontSize: 36,
            fontWeight: 700,
            color: rankColor(rank, isLast),
          }}
        >
          {isLast ? "Last" : ordinal(rank)}
        </div>

        {/* Champion pip — top-right (only on 1st) */}
        {isChampion && (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 12,
              right: 12,
              padding: "4px 10px",
              background: AMBER_500,
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              color: "#09090b",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Champion
          </div>
        )}

        {/* Bottom gradient scrim + name/record overlay */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "55%",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 14,
            padding: "0 14px",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 700,
              color: "#fafafa",
              maxWidth: "100%",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
              letterSpacing: "-0.01em",
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 4,
              fontSize: 18,
              color: isLast ? RED_400 : isChampion ? EMERALD_400 : ZINC_300,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {record}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderBranded(message: string) {
  return jpegFromImageResponse(new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: BG,
          color: "#fafafa",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700 }}>
          MTG Dash
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 12,
            fontSize: 28,
            color: ZINC_400,
          }}
        >
          {message}
        </div>
      </div>
    ),
    size
  ));
}

function renderStatusCard({
  title,
  subtitle,
  statusLabel,
}: {
  title: string;
  subtitle: string;
  statusLabel: string;
}) {
  return jpegFromImageResponse(new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: BG,
          color: "#fafafa",
          padding: "60px 80px",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: AMBER_500,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          {statusLabel}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 12,
            fontSize: 28,
            color: ZINC_400,
          }}
        >
          {subtitle}
        </div>
      </div>
    ),
    size
  ));
}
