CREATE TABLE "player_portraits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"archetype" text,
	"theme_label" text,
	"selfie_url" text,
	"avatar_url" text NOT NULL,
	"avatar_wounded_url" text,
	"avatar_critical_url" text,
	"avatar_victory_url" text,
	"avatar_defeat_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "set_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "portrait_theme" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_poll_id" uuid;--> statement-breakpoint
ALTER TABLE "player_portraits" ADD CONSTRAINT "player_portraits_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_portraits_player_idx" ON "player_portraits" USING btree ("player_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_poll_id_date_polls_id_fk" FOREIGN KEY ("source_poll_id") REFERENCES "public"."date_polls"("id") ON DELETE set null ON UPDATE no action;