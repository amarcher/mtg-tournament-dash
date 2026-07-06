import { describe, it, expect } from "vitest";
import { pickLeadingOptionId, tallyResponses } from "./poll-tally";
import type { PollResponseValue } from "./schedule-types";

const R = (...responses: PollResponseValue[]) => responses;

describe("tallyResponses", () => {
  it("counts each response kind", () => {
    expect(tallyResponses(R("yes", "yes", "if_need_be", "no"))).toEqual({
      yes: 2,
      ifNeedBe: 1,
      no: 1,
      score: 5,
    });
  });

  it("empty responses score zero", () => {
    expect(tallyResponses([])).toEqual({ yes: 0, ifNeedBe: 0, no: 0, score: 0 });
  });

  it("if-need-be counts half a yes", () => {
    expect(tallyResponses(R("if_need_be", "if_need_be")).score).toBe(
      tallyResponses(R("yes")).score
    );
  });
});

describe("pickLeadingOptionId", () => {
  const opt = (
    id: string,
    startsAt: string,
    responses: PollResponseValue[]
  ) => ({ id, startsAt: new Date(startsAt), responses });

  it("picks the highest score", () => {
    expect(
      pickLeadingOptionId([
        opt("a", "2026-07-10T23:00:00Z", R("yes", "no")),
        opt("b", "2026-07-17T23:00:00Z", R("yes", "yes")),
      ])
    ).toBe("b");
  });

  it("yes beats two if-need-be plus a no on equal score by earlier date", () => {
    expect(
      pickLeadingOptionId([
        opt("later", "2026-07-17T23:00:00Z", R("yes")),
        opt("earlier", "2026-07-10T23:00:00Z", R("if_need_be", "if_need_be")),
      ])
    ).toBe("earlier");
  });

  it("returns null when nothing has a positive score", () => {
    expect(
      pickLeadingOptionId([
        opt("a", "2026-07-10T23:00:00Z", R("no", "no")),
        opt("b", "2026-07-17T23:00:00Z", []),
      ])
    ).toBeNull();
  });
});
