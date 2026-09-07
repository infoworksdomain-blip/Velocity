-- STEP 13: platform_quota_state gains request_kind so a publish-rate
-- cap and a metrics-read-rate cap on the same account are tracked as
-- separate counters, not conflated into one. NOT NULL DEFAULT 'publish'
-- backfills every existing row (all pre-STEP-13 rows really were
-- publish-quota rows) in the same statement.
ALTER TABLE "platform_quota_state" ADD COLUMN "request_kind" text DEFAULT 'publish' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "platform_quota_state_social_account_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "platform_quota_state_social_account_id_request_kind_idx" ON "platform_quota_state" USING btree ("social_account_id","request_kind");
