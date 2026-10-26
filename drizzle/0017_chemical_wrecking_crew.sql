CREATE TYPE "public"."team_side" AS ENUM('a', 'b');--> statement-breakpoint
ALTER TYPE "public"."tournament_format" ADD VALUE 'team_draft';--> statement-breakpoint
ALTER TABLE "event_players" ADD COLUMN "team" "team_side";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "team_a_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "team_b_name" text;