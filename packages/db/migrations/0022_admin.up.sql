-- STEP 18: Admin. Three independent additions:
--
-- 1. `feature_flags` (existing since migration 0000, already RLS'd by
--    migration 0001's dynamic sweep) gains `user_id` -- an additive column
--    only, no RLS re-application needed, same precedent as 0018's
--    campaigns.paused_at.
-- 2. `users` (platform-root, no RLS) gains real suspension columns.
-- 3. Two brand-new platform-root tables (`ai_provider_configs`,
--    `ai_router_settings`) are the DB-backed `ProviderConfigSource`
--    STEP 8's own config-source.ts doc comment reserved for this step --
--    seeded below with the exact values `config/providers.json` currently
--    holds, so switching the router from the file source to the DB source
--    does not silently change provider behaviour.

ALTER TABLE "feature_flags" ADD COLUMN "user_id" uuid;
--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_reason" text;
--> statement-breakpoint

CREATE TABLE "ai_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"provider_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"adapter" text DEFAULT 'stub' NOT NULL,
	"breaker_failure_threshold" integer DEFAULT 5 NOT NULL,
	"breaker_window_sec" integer DEFAULT 60 NOT NULL,
	"breaker_cooldown_sec" integer DEFAULT 120 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "ai_provider_configs_kind_provider_idx" ON "ai_provider_configs" ("kind", "provider_id");
--> statement-breakpoint

CREATE TABLE "ai_router_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fallback_chain_max_length" integer DEFAULT 3 NOT NULL,
	"cost_ceiling_video_usd" numeric(10, 4) NOT NULL,
	"cost_ceiling_image_usd" numeric(10, 4) NOT NULL,
	"cost_ceiling_tts_usd" numeric(10, 4) NOT NULL,
	"cost_ceiling_transcription_usd" numeric(10, 4) NOT NULL,
	"cost_ceiling_text_usd" numeric(10, 4) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_provider_configs" TO velocity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_router_settings" TO velocity_app;

-- Seed: exact current values from config/providers.json, so the DB source
-- starts equivalent to the file source (see apps/worker's
-- DbProviderConfigSource, which overlays these rows onto the file source's
-- credentials/shape rather than duplicating credential handling).
INSERT INTO "ai_provider_configs" ("kind", "provider_id", "enabled", "weight", "tiers", "adapter") VALUES
	('video', 'kling-3.0', true, 100, '["free","starter","growth","pro"]'::jsonb, 'stub'),
	('video', 'veo-3.1', true, 70, '["growth","pro"]'::jsonb, 'stub'),
	('video', 'seedance-2.5', true, 60, '["free","starter","growth","pro"]'::jsonb, 'stub'),
	('video', 'minimax-h3', true, 50, '["free","starter","growth","pro"]'::jsonb, 'stub'),
	('video', 'wan-2.2', true, 40, '["free","starter","growth","pro"]'::jsonb, 'stub'),
	('image', 'seedream-5.0', true, 100, '["free","starter","growth","pro"]'::jsonb, 'stub'),
	('tts', 'elevenlabs', true, 100, '["free","starter","growth","pro"]'::jsonb, 'stub'),
	('transcription', 'whisperx', true, 100, '["free","starter","growth","pro"]'::jsonb, 'stub'),
	('text', 'anthropic', true, 100, '["free","starter","growth","pro"]'::jsonb, 'http'),
	('text', 'openai', true, 70, '["free","starter","growth","pro"]'::jsonb, 'http');
--> statement-breakpoint

INSERT INTO "ai_router_settings" ("fallback_chain_max_length", "cost_ceiling_video_usd", "cost_ceiling_image_usd", "cost_ceiling_tts_usd", "cost_ceiling_transcription_usd", "cost_ceiling_text_usd")
VALUES (3, 0.6, 0.05, 0.02, 0.01, 0.02);
