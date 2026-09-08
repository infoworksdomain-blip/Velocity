-- STEP 16: a real, reversible pause state for campaigns, so the Automation
-- Engine's pause_campaign action has somewhere real to write. campaigns
-- already existed since migration 0000 and already has RLS from migration
-- 0001's dynamic sweep (it existed at that time) — this is an additive
-- column only, no RLS re-application needed.
ALTER TABLE "campaigns" ADD COLUMN "paused_at" timestamp with time zone;
