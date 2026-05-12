CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_slug_idx" ON "leagues" USING btree ("slug");--> statement-breakpoint
INSERT INTO "leagues" ("slug", "name") VALUES
	('demo', 'Demo League'),
	('lexington-dads-magic-draft', 'Lexington Dads Magic Draft')
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "league_id" uuid;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "league_id" uuid;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "league_token" text;--> statement-breakpoint
UPDATE "events" SET "league_id" = (SELECT "id" FROM "leagues" WHERE "slug" = 'demo') WHERE "league_id" IS NULL;--> statement-breakpoint
UPDATE "players" SET "league_id" = (SELECT "id" FROM "leagues" WHERE "slug" = 'demo') WHERE "league_id" IS NULL;--> statement-breakpoint
UPDATE "players" SET "league_token" = gen_random_uuid()::text WHERE "league_token" IS NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "league_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "league_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "league_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_league_idx" ON "events" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "players_league_idx" ON "players" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_league_token_idx" ON "players" USING btree ("league_token");
