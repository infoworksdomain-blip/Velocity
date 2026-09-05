-- Reverses 0000_initial_schema.up.sql. Written by hand — drizzle-kit does
-- not generate down migrations, so this is our own migrator's contract
-- (packages/db/src/migrator.ts), not a drizzle-kit feature.
--
-- CASCADE handles the FK web regardless of drop order, so tables are listed
-- in no particular order below.

DROP TABLE IF EXISTS "attribution_events" CASCADE;
DROP TABLE IF EXISTS "link_shorts" CASCADE;
DROP TABLE IF EXISTS "metric_snapshots" CASCADE;
DROP TABLE IF EXISTS "agent_runs" CASCADE;
DROP TABLE IF EXISTS "automation_runs" CASCADE;
DROP TABLE IF EXISTS "automations" CASCADE;
DROP TABLE IF EXISTS "credit_ledger" CASCADE;
DROP TABLE IF EXISTS "invoices" CASCADE;
DROP TABLE IF EXISTS "subscriptions" CASCADE;
DROP TABLE IF EXISTS "usage_events" CASCADE;
DROP TABLE IF EXISTS "blitz_events" CASCADE;
DROP TABLE IF EXISTS "blitz_sessions" CASCADE;
DROP TABLE IF EXISTS "brand_assets" CASCADE;
DROP TABLE IF EXISTS "brand_profiles" CASCADE;
DROP TABLE IF EXISTS "brand_rules" CASCADE;
DROP TABLE IF EXISTS "angles" CASCADE;
DROP TABLE IF EXISTS "personas" CASCADE;
DROP TABLE IF EXISTS "trend_blueprints" CASCADE;
DROP TABLE IF EXISTS "ugc_clips" CASCADE;
DROP TABLE IF EXISTS "content_concepts" CASCADE;
DROP TABLE IF EXISTS "content_items" CASCADE;
DROP TABLE IF EXISTS "hook_variants" CASCADE;
DROP TABLE IF EXISTS "storyboards" CASCADE;
DROP TABLE IF EXISTS "text_plans" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "feature_flags" CASCADE;
DROP TABLE IF EXISTS "moderation_reviews" CASCADE;
DROP TABLE IF EXISTS "risk_signals" CASCADE;
DROP TABLE IF EXISTS "invitations" CASCADE;
DROP TABLE IF EXISTS "memberships" CASCADE;
DROP TABLE IF EXISTS "organisations" CASCADE;
DROP TABLE IF EXISTS "roles" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "workspaces" CASCADE;
DROP TABLE IF EXISTS "fonts" CASCADE;
DROP TABLE IF EXISTS "media_assets" CASCADE;
DROP TABLE IF EXISTS "renders" CASCADE;
DROP TABLE IF EXISTS "text_style_presets" CASCADE;
DROP TABLE IF EXISTS "calendar_slots" CASCADE;
DROP TABLE IF EXISTS "campaigns" CASCADE;
DROP TABLE IF EXISTS "publication_attempts" CASCADE;
DROP TABLE IF EXISTS "publications" CASCADE;
DROP TABLE IF EXISTS "schedules" CASCADE;
DROP TABLE IF EXISTS "platform_credentials" CASCADE;
DROP TABLE IF EXISTS "platform_quota_state" CASCADE;
DROP TABLE IF EXISTS "social_accounts" CASCADE;
DROP TABLE IF EXISTS "api_keys" CASCADE;
DROP TABLE IF EXISTS "webhook_deliveries" CASCADE;
DROP TABLE IF EXISTS "webhooks" CASCADE;

DROP TYPE IF EXISTS "public"."content_format";
DROP TYPE IF EXISTS "public"."content_item_status";
DROP TYPE IF EXISTS "public"."invitation_status";
DROP TYPE IF EXISTS "public"."membership_role";
DROP TYPE IF EXISTS "public"."platform";
DROP TYPE IF EXISTS "public"."platform_role";
DROP TYPE IF EXISTS "public"."publication_status";
DROP TYPE IF EXISTS "public"."role_scope";
DROP TYPE IF EXISTS "public"."swipe_direction";
DROP TYPE IF EXISTS "public"."workspace_type";

DROP EXTENSION IF EXISTS vector;
DROP EXTENSION IF EXISTS pgcrypto;
