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
import { user } from "./auth-schema";

export * from "./auth-schema";

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

export const pollStatus = pgEnum("poll_status", [
  "open",
  "finalized",
  "canceled",
]);

export const pollResponse = pgEnum("poll_response", [
  "yes",
  "if_need_be",
  "no",
]);

export const leagueMemberRole = pgEnum("league_member_role", [
  "owner",
  "organizer",
]);

export const leagues = pgTable(
  "leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // No-login admin access: knowing this token (via the
    // /leagues/[slug]/manage/[token] link) grants organizer rights through a
    // cookie. Nullable — leagues inserted by seed/verify scripts don't mint
    // one, and a null token never matches any cookie.
    organizerToken: text("organizer_token"),
    // Shareable co-manager invite: signing in and visiting
    // /leagues/[slug]/invite/[token] creates a league_members row. Rotating
    // either token invalidates all outstanding links (and cookies) at once.
    managerInviteToken: text("manager_invite_token"),
    ownerUserId: text("owner_user_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    slugIdx: uniqueIndex("leagues_slug_idx").on(t.slug),
    organizerTokenIdx: uniqueIndex("leagues_organizer_token_idx").on(
      t.organizerToken
    ),
    managerInviteTokenIdx: uniqueIndex("leagues_manager_invite_token_idx").on(
      t.managerInviteToken
    ),
  })
);

export const leagueMembers = pgTable(
  "league_members",
  {
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: leagueMemberRole("role").notNull().default("organizer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: uniqueIndex("league_members_pk").on(t.leagueId, t.userId),
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
    // When the night actually happens — set by promoting a date poll, or
    // left null for events created directly.
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    // The MTG set being drafted, e.g. "The Lord of the Rings: Tales of
    // Middle-earth". Display-only metadata.
    setName: text("set_name"),
    // Free-text portrait theme for this draft. When set, wizardize runs that
    // opt into it swap the archetype costume clause for this description —
    // e.g. LOTR characters instead of generic wizards.
    portraitTheme: text("portrait_theme"),
    sourcePollId: uuid("source_poll_id").references(() => datePolls.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    leagueIdx: index("events_league_idx").on(t.leagueId),
    // One event per poll: closes the check-then-insert race in
    // promoteDatePollAction (Postgres treats NULLs as distinct, so direct
    // event creation is unaffected).
    sourcePollIdx: uniqueIndex("events_source_poll_idx").on(t.sourcePollId),
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
    // Mid-event drop: the player keeps every completed result (standings,
    // ELO) but is excluded from future pairings; their unfinished matches
    // convert to byes for the opponent. Null = active on the roster.
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
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
    // Null roundId = a "bonus game": a casual head-to-head outside any
    // tournament round. Bonus games carry leagueId (their owning scope) and
    // never touch ELO, standings, or Swiss pairing — every tournament query
    // joins through rounds, so they're invisible by construction.
    roundId: uuid("round_id").references(() => rounds.id, {
      onDelete: "cascade",
    }),
    leagueId: uuid("league_id").references(() => leagues.id, {
      onDelete: "cascade",
    }),
    // Set when a bonus game was started from inside an event (the waiting
    // room). Powers the "looking for a bonus game" list; display-only.
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    // Bonus games only — tournament matches take the event's startingLife.
    startingLife: integer("starting_life"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
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
    leagueIdx: index("matches_league_idx").on(t.leagueId),
    eventIdx: index("matches_event_idx").on(t.eventId),
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

export const datePolls = pgTable(
  "date_polls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdByPlayerId: uuid("created_by_player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    status: pollStatus("status").notNull().default("open"),
    finalizedOptionId: uuid("finalized_option_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    leagueIdx: index("date_polls_league_idx").on(t.leagueId),
  })
);

export const pollOptions = pgTable(
  "poll_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => datePolls.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pollIdx: index("poll_options_poll_idx").on(t.pollId),
  })
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    optionId: uuid("option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    response: pollResponse("response").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: uniqueIndex("poll_votes_pk").on(t.optionId, t.playerId),
  })
);

// Catalog of every wizard set a player has generated. `players.avatar*Url`
// stays the "active" set; these rows let a player re-apply an older look.
// Blob keys are versioned per row (avatars/<playerId>/<portraitId>/<tier>.jpg)
// so regenerating never overwrites a cataloged image.
export const playerPortraits = pgTable(
  "player_portraits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    archetype: text("archetype"),
    // Short human label for the chooser, e.g. a draft's set name when the
    // portrait was generated under an event theme.
    themeLabel: text("theme_label"),
    selfieUrl: text("selfie_url"),
    avatarUrl: text("avatar_url").notNull(),
    avatarWoundedUrl: text("avatar_wounded_url"),
    avatarCriticalUrl: text("avatar_critical_url"),
    avatarVictoryUrl: text("avatar_victory_url"),
    avatarDefeatUrl: text("avatar_defeat_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    playerIdx: index("player_portraits_player_idx").on(t.playerId),
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
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Event = typeof events.$inferSelect;
export type EventPlayer = typeof eventPlayers.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Game = typeof games.$inferSelect;
export type EloChange = typeof eloChanges.$inferSelect;
export type PlayerPortrait = typeof playerPortraits.$inferSelect;
export type DatePoll = typeof datePolls.$inferSelect;
export type PollOption = typeof pollOptions.$inferSelect;
export type PollVote = typeof pollVotes.$inferSelect;
