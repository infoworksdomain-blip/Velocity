DROP INDEX IF EXISTS "trend_blueprints_competitor_id_idx";--> statement-breakpoint
ALTER TABLE "trend_blueprints" DROP CONSTRAINT IF EXISTS "trend_blueprints_competitor_id_competitors_id_fk";--> statement-breakpoint
ALTER TABLE "trend_blueprints" DROP COLUMN IF EXISTS "competitor_id";--> statement-breakpoint
DROP TABLE IF EXISTS "competitors";
