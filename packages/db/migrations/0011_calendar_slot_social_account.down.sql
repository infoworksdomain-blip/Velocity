DROP INDEX IF EXISTS "calendar_slots_social_account_id_idx";--> statement-breakpoint
ALTER TABLE "calendar_slots" DROP COLUMN IF EXISTS "social_account_id";
