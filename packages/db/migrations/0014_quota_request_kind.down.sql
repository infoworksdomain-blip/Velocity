DROP INDEX IF EXISTS "platform_quota_state_social_account_id_request_kind_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "platform_quota_state_social_account_id_idx" ON "platform_quota_state" USING btree ("social_account_id");--> statement-breakpoint
ALTER TABLE "platform_quota_state" DROP COLUMN IF EXISTS "request_kind";
