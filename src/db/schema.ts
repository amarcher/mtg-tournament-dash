import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const eventStatus = pgEnum("event_status", [
  "draft",
  "active",
  "complete",
]);

export const roundStatus = pgEnum("round_status", [
  "pending",
  "active",
  "complete",
]);

export const matchStatus = pgEnum("match_status", [
  "pending",
  "in_progress",
  "complete",
]);

export const tournamentFormat = pgEnum("tournament_format", [
  "swiss",
  "round_robin",
  "single_elim",
  "commander_pod",
]);

export const leagues = pgTable(
  "leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    slugIdx: uniqueIndex("leagues_slug_idx").on(t.slug),
  })
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    leagueToken: text("league_token").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    avatarWoundedUrl: text("avatar_wounded_url"),
    avatarCriticalUrl: text("avatar_critical_url"),
    avatarVictoryUrl: text("avatar_victory_url"),
    avatarDefeatUrl: text("avatar_defeat_url"),
    selfieUrl: text("selfie_url"),
    wizardArchetype: text("wizard_archetype"),
    // Set when wizardize starts; cleared when the background job finishes
    // (success or failure). The player page polls while this is non-null.
    wizardJobStartedAt: timestamp("wizard_job_started_at", {
      withTimezone: true,
    }),
    // Populated when the background wizardize job throws. Cleared on the
    // next successful regen. Surfaced in the WizardForm so failures (Mac
    // asleep, blob token missing, FLUX OOM) stop being silent.
    wizardJobError: text("wizard_job_error"),
    currentElo: integer("current_elo").notNull().default(1200),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    leagueIdx: index("players_league_idx").on(t.leagueId),
    tokenIdx: uniqueIndex("players_league_token_idx").on(t.leagueToken),
  })
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    format: tournamentFormat("format").notNull().default("swiss"),
    status: eventStatus("status").notNull().default("draft"),
    totalRounds: integer("total_rounds").notNull().default(3),
    startingLife: integer("starting_life").notNull().default(20),
    roundDurationSec: integer("round_duration_sec").notNull().default(3000),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    leagueIdx: index("events_league_idx").on(t.leagueId),
  })
);

export const eventPlayers = pgTable(
  "event_players",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    seed: integer("seed").notNull(),
    startingElo: integer("starting_elo").notNull(),
    finalStanding: integer("final_standing"),
    joinToken: text("join_token").notNull(),
  },
  (t) => ({
    pk: uniqueIndex("event_players_pk").on(t.eventId, t.playerId),
    tokenIdx: uniqueIndex("event_players_token_idx").on(t.joinToken),
  })
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    status: roundStatus("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("rounds_event_number_idx").on(t.eventId, t.roundNumber),
  })
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    tableNumber: integer("table_number").notNull(),
    playerAId: uuid("player_a_id")
      .notNull()
      .references(() => players.id),
    playerBId: uuid("player_b_id").references(() => players.id), // null = bye
    status: matchStatus("status").notNull().default("pending"),
    winnerId: uuid("winner_id").references(() => players.id),
    isDraw: boolean("is_draw").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    roundIdx: index("matches_round_idx").on(t.roundId),
  })
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    gameNumber: integer("game_number").notNull(),
    playerALife: integer("player_a_life").notNull().default(20),
    playerBLife: integer("player_b_life").notNull().default(20),
    winnerId: uuid("winner_id").references(() => players.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("games_match_number_idx").on(t.matchId, t.gameNumber),
  })
);

export const eloChanges = pgTable("elo_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id),
  before: integer("before").notNull(),
  after: integer("after").notNull(),
  delta: integer("delta").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Event = typeof events.$inferSelect;
export type EventPlayer = typeof eventPlayers.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Game = typeof games.$inferSelect;
export type EloChange = typeof eloChanges.$inferSelect;
