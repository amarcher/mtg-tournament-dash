-- Existing leagues predate organizer/invite tokens. Mint them so the
-- organizer-link escape hatch works everywhere without hand-editing rows.
-- Two concatenated UUIDs ≈ 244 bits of entropy, hyphens stripped; tokens are
-- compared verbatim so the shape doesn't need to match generateJoinToken.
UPDATE "leagues"
SET "organizer_token" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "organizer_token" IS NULL;--> statement-breakpoint
UPDATE "leagues"
SET "manager_invite_token" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "manager_invite_token" IS NULL;
