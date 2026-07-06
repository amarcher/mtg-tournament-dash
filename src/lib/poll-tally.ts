import type { PollResponseValue } from "./schedule-types";

export type OptionTally = {
  yes: number;
  ifNeedBe: number;
  no: number;
  score: number;
};

export function tallyResponses(responses: PollResponseValue[]): OptionTally {
  let yes = 0;
  let ifNeedBe = 0;
  let no = 0;
  for (const r of responses) {
    if (r === "yes") yes += 1;
    else if (r === "if_need_be") ifNeedBe += 1;
    else no += 1;
  }
  return { yes, ifNeedBe, no, score: yes * 2 + ifNeedBe };
}

/**
 * The date to highlight while a poll is open: highest score (yes = 2,
 * if-need-be = 1), earliest date on ties, none when nobody can make
 * anything yet.
 */
export function pickLeadingOptionId(
  options: { id: string; startsAt: Date; responses: PollResponseValue[] }[]
): string | null {
  let best: { id: string; score: number; startsAt: Date } | null = null;
  for (const o of options) {
    const { score } = tallyResponses(o.responses);
    if (score === 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && o.startsAt < best.startsAt)
    ) {
      best = { id: o.id, score, startsAt: o.startsAt };
    }
  }
  return best?.id ?? null;
}
