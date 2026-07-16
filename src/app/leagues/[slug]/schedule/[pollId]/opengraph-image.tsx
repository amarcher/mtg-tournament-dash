import { ImageResponse } from "next/og";
import { getDatePoll, getLeagueBySlug, getPollDetail } from "@/db/queries";
import { formatPollDate } from "@/lib/schedule-types";

export const alt = "MTG Dash draft night scheduling poll";
export const size = { width: 1200, height: 630 };
// Text-only card stays well under Slack's inline-render cutoff as PNG, so no
// JPEG re-encode needed (unlike the avatar-heavy event image).
export const contentType = "image/png";

// Polls change as votes come in — keep re-shares reasonably fresh.
export const revalidate = 600;

const BG = "#09090b";
const CARD_BG = "#18181b";
const ZINC_500 = "#71717a";
const ZINC_400 = "#a1a1aa";
const ZINC_200 = "#e4e4e7";
const AMBER_500 = "#f59e0b";
const EMERALD_400 = "#34d399";

const MAX_ROWS = 4;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; pollId: string }>;
}) {
  const { slug, pollId } = await params;

  const [league, poll] = await Promise.all([
    getLeagueBySlug(slug),
    getDatePoll(pollId),
  ]);
  if (!league || !poll || poll.leagueId !== league.id) {
    return renderBranded("Scheduling poll not found");
  }

  const options = await getPollDetail(poll.id);
  const rows = options.slice(0, MAX_ROWS).map((o) => {
    const yes = o.votes.filter((v) => v.response === "yes").length;
    const maybe = o.votes.filter((v) => v.response === "if_need_be").length;
    return {
      id: o.id,
      label: formatPollDate(o.startsAt),
      tally:
        yes + maybe === 0
          ? "no votes yet"
          : `${yes} yes${maybe > 0 ? ` · ${maybe} maybe` : ""}`,
      isWinner: poll.finalizedOptionId === o.id,
    };
  });
  const overflow = options.length - rows.length;

  const finalized = poll.status === "finalized";
  const statusLabel = finalized
    ? "Draft night is set"
    : poll.status === "canceled"
      ? "Poll canceled"
      : "Vote on a date";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          color: ZINC_200,
          padding: "44px 56px",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 18,
            fontWeight: 700,
            color: finalized ? EMERALD_400 : AMBER_500,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
          }}
        >
          {statusLabel}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#fafafa",
          }}
        >
          {poll.title}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 6,
            fontSize: 22,
            color: ZINC_400,
          }}
        >
          {league.name}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            gap: 12,
            flex: 1,
          }}
        >
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: row.isWinner ? "rgba(52,211,153,0.12)" : CARD_BG,
                border: `2px solid ${row.isWinner ? EMERALD_400 : "#27272a"}`,
                borderRadius: 14,
                padding: "16px 24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 34,
                  fontWeight: 600,
                  color: row.isWinner ? EMERALD_400 : "#fafafa",
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: row.isWinner ? EMERALD_400 : ZINC_500,
                  fontWeight: row.isWinner ? 700 : 400,
                }}
              >
                {row.isWinner ? "Locked in" : row.tally}
              </div>
            </div>
          ))}
          {overflow > 0 && (
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: ZINC_500,
                paddingLeft: 8,
              }}
            >
              +{overflow} more date{overflow === 1 ? "" : "s"}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 20,
            color: ZINC_500,
          }}
        >
          <div style={{ display: "flex" }}>MTG Dash</div>
          <div style={{ display: "flex" }}>
            {finalized ? "See you there" : "Tap to cast your vote"}
          </div>
        </div>
      </div>
    ),
    size
  );
}

function renderBranded(message: string) {
  return new ImageResponse(
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
  );
}
