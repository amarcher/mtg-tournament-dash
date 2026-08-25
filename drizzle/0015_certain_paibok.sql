CREATE TYPE "public"."night_status" AS ENUM('planned', 'confirmed', 'canceled');--> statement-breakpoint
CREATE TABLE "game_nights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" "night_status" DEFAULT 'planned' NOT NULL,
	"host_player_id" uuid,
	"venue" text,
	"set_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "night_rsvps" (
	"night_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"response" "poll_response" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_night_id" uuid;--> statement-breakpoint
ALTER TABLE "game_nights" ADD CONSTRAINT "game_nights_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_nights" ADD CONSTRAINT "game_nights_host_player_id_players_id_fk" FOREIGN KEY ("host_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_rsvps" ADD CONSTRAINT "night_rsvps_night_id_game_nights_id_fk" FOREIGN KEY ("night_id") REFERENCES "public"."game_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_rsvps" ADD CONSTRAINT "night_rsvps_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_nights_league_idx" ON "game_nights" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_nights_league_starts_at_idx" ON "game_nights" USING btree ("league_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "night_rsvps_pk" ON "night_rsvps" USING btree ("night_id","player_id");--> statement-breakpoint
CREATE INDEX "night_rsvps_night_idx" ON "night_rsvps" USING btree ("night_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_night_id_game_nights_id_fk" FOREIGN KEY ("source_night_id") REFERENCES "public"."game_nights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_source_night_idx" ON "events" USING btree ("source_night_id");