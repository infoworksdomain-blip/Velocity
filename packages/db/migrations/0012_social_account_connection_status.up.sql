-- STEP 11: social_accounts gains connection_status (GATE 11: "a revoked
-- token yields a clear reconnect prompt, not a silent failure" — this
-- column is what that prompt reads) and a last-health-check timestamp.
CREATE TYPE "public"."connection_status" AS ENUM('connected', 'reauth_required', 'disconnected');--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "connection_status" "connection_status" DEFAULT 'connected' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "last_health_check_at" timestamp with time zone;--> statement-breakpoint

-- One quota-window row per social account — see schema/social.ts's own
-- comment: this is what makes checkAndIncrementQuota's INSERT ... ON
-- CONFLICT genuinely atomic under real concurrency (GATE 11).
CREATE UNIQUE INDEX "platform_quota_state_social_account_id_idx" ON "platform_quota_state" USING btree ("social_account_id");
