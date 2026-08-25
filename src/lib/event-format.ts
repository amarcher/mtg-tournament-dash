// Shared by the night-planning form (client) and the actions that validate
// it, so the enum lives outside the "use server" module — same split as
// wizard-types.ts.

export const TOURNAMENT_FORMATS = [
  "swiss",
  "round_robin",
  "single_elim",
  "commander_pod",
] as const;

export type TournamentFormatValue = (typeof TOURNAMENT_FORMATS)[number];

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormatValue, string> = {
  swiss: "Swiss",
  round_robin: "Round robin",
  single_elim: "Single elimination",
  commander_pod: "Commander pod",
};

export const DEFAULT_TOURNAMENT_FORMAT: TournamentFormatValue = "swiss";

export function isTournamentFormat(
  value: unknown
): value is TournamentFormatValue {
  return TOURNAMENT_FORMATS.includes(value as TournamentFormatValue);
}
