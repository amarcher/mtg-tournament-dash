import { ImageResponse } from "next/og";
import {
  countUpcomingNights,
  getLeagueBySlug,
  listUpcomingNights,
} from "@/db/queries";
import { formatPollDateParts } from "@/lib/schedule-types";
import { tallyResponses } from "@/lib/poll-tally";

export const alt = "Upcoming draft nights";
export const size = { width: 1200, height: 630 };
// Text-only card — stays well under Slack's inline-render cutoff as PNG.
export const contentType = "image/png";

// RSVPs move constantly; keep a re-share reasonably fresh without paying for
// a render on every unfurl.
export const revalidate = 600;

const BG = "#09090b";
const CARD_BG = "#18181b";
const ZINC_600 = "#52525b";
const ZINC_500 = "#71717a";
const ZINC_400 = "#a1a1aa";
const ZINC_200 = "#e4e4e7";
const AMBER_500 = "#f59e0b";
const EMERALD_400 = "#34d399";

// Three rows is what fits above the footer at 1200x630 with a 76px calendar
// tile; a fourth overflows and collides with it. The rest are summarized by
// the "+N more" line, which is better information than a clipped row anyway.
const MAX_ROWS = 3;
const FONT =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return renderBranded("League not found");

  const [nights, total] = await Promise.all([
    listUpcomingNights(league.id, MAX_ROWS),
    countUpcomingNights(league.id),
  ]);

  if (nights.length === 0) {
    return renderBranded(`${league.name} · no dates on the calendar yet`);
  }

  const overflow = total - nights.length;

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
          padding: "40px 56px",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 18,
            fontWeight: 700,
            color: AMBER_500,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
          }}
        >
          Upcoming draft nights
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 8,
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#fafafa",
          }}
        >
          {league.name}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 24,
            gap: 10,
            flex: 1,
          }}
        >
          {nights.map((night, i) => {
            const { weekday, month, day, time } = formatPollDateParts(
              night.startsAt
            );
            const tally = tallyResponses(night.rsvps.map((r) => r.response));
            // Only the soonest night gets the accent — a card where every row
            // shouts reads as no emphasis at all.
            const isNext = i === 0;
            const plan = [
              night.setName,
              night.hostName ? `Host: ${night.hostName}` : null,
              night.venue,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={night.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  background: isNext ? "rgba(245,158,11,0.10)" : CARD_BG,
                  border: `2px solid ${isNext ? AMBER_500 : "#27272a"}`,
                  borderRadius: 14,
                  padding: "12px 20px",
                }}
              >
                {/* Calendar tile — month over day is what makes this read as
                    a calendar rather than a list of sentences. */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 76,
                    height: 76,
                    borderRadius: 12,
                    background: isNext ? AMBER_500 : "#27272a",
                    color: isNext ? "#09090b" : ZINC_200,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    {month}
                  </div>
                  <div
                    style={{ display: "flex", fontSize: 34, fontWeight: 700 }}
                  >
                    {day}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: 30,
                      fontWeight: 600,
                      color: "#fafafa",
                    }}
                  >
                    {weekday} · {time}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: 20,
                      color: plan ? ZINC_400 : ZINC_600,
                      marginTop: 2,
                    }}
                  >
                    {plan || "Set and host still to be decided"}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: 30,
                      fontWeight: 700,
                      color: tally.yes > 0 ? EMERALD_400 : ZINC_600,
                    }}
                  >
                    {tally.yes} in
                  </div>
                  {tally.ifNeedBe > 0 && (
                    <div
                      style={{
                        display: "flex",
                        fontSize: 18,
                        color: AMBER_500,
                      }}
                    >
                      {tally.ifNeedBe} maybe
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {overflow > 0 && (
            <div
              style={{ display: "flex", fontSize: 20, color: ZINC_500, paddingLeft: 8 }}
            >
              +{overflow} more night{overflow === 1 ? "" : "s"} on the calendar
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "auto",
            fontSize: 20,
            color: ZINC_500,
          }}
        >
          <div style={{ display: "flex" }}>MTG Dash</div>
          <div style={{ display: "flex" }}>Tap to say if you&apos;re in</div>
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
          fontFamily: FONT,
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700 }}>
          MTG Dash
        </div>
        <div
          style={{ display: "flex", marginTop: 12, fontSize: 28, color: ZINC_400 }}
        >
          {message}
        </div>
      </div>
    ),
    size
  );
}
