DROP INDEX IF EXISTS "platform_quota_state_social_account_id_idx";--> statement-breakpoint
ALTER TABLE "social_accounts" DROP COLUMN IF EXISTS "last_health_check_at";--> statement-breakpoint
ALTER TABLE "social_accounts" DROP COLUMN IF EXISTS "connection_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."connection_status";
