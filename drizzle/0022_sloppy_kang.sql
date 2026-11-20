ALTER TABLE "leagues" ADD COLUMN "claim_policy" text DEFAULT 'anyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "players_league_user_idx" ON "players" USING btree ("league_id","user_id");