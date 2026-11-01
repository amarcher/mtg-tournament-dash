CREATE TYPE "public"."push_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "push_device_players" (
	"device_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"platform" "push_platform" NOT NULL,
	"app_build" text,
	"notify_rounds" boolean DEFAULT true NOT NULL,
	"notify_schedule" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_id" uuid,
	"player_id" uuid,
	"kind" text NOT NULL,
	"collapse_id" text,
	"outcome" text NOT NULL,
	"reason" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_device_players" ADD CONSTRAINT "push_device_players_device_id_push_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."push_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_device_players" ADD CONSTRAINT "push_device_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_log" ADD CONSTRAINT "push_log_device_id_push_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."push_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_log" ADD CONSTRAINT "push_log_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_device_players_pk" ON "push_device_players" USING btree ("device_id","player_id");--> statement-breakpoint
CREATE INDEX "push_device_players_player_idx" ON "push_device_players" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_devices_token_idx" ON "push_devices" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_log_sent_idx" ON "push_log" USING btree ("sent_at");