-- STEP 16: real exponential-backoff retry state for webhook_deliveries.
-- webhooks/webhook_deliveries both already existed since migration 0000
-- (STEP 1's upfront domain design) and already have RLS from migration
-- 0001's dynamic sweep — these are additive columns only, no RLS
-- re-application needed.
ALTER TABLE "webhook_deliveries" ADD COLUMN "next_retry_at" timestamp with time zone;
ALTER TABLE "webhook_deliveries" ADD COLUMN "last_error" text;
