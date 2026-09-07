DROP INDEX IF EXISTS "velocity_events_content_concept_id_idx";--> statement-breakpoint
DROP TABLE IF EXISTS "velocity_preferences";--> statement-breakpoint
ALTER TABLE "content_concepts" DROP COLUMN IF EXISTS "hook_pattern";
