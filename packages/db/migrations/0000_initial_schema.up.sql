-- Extensions must exist before any column/default below uses them:
-- pgcrypto for gen_random_uuid() (every id column's default), vector for
-- the pgvector embedding columns on brand_profiles, trend_blueprints,
-- content_concepts, hook_variants.
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."content_format" AS ENUM('ai_ugc', 'slideshow', 'hook_demo', 'meme');--> statement-breakpoint
CREATE TYPE "public"."content_item_status" AS ENUM('concept', 'queued', 'rendering', 'ready', 'scheduled', 'published', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'editor', 'contributor', 'viewer', 'client', 'agency_manager');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('tiktok', 'instagram', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('superadmin', 'support', 'moderator', 'finance');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('pending', 'publishing', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."role_scope" AS ENUM('workspace', 'platform');--> statement-breakpoint
CREATE TYPE "public"."swipe_direction" AS ENUM('left', 'right');--> statement-breakpoint
CREATE TYPE "public"."workspace_type" AS ENUM('individual', 'business');--> statement-breakpoint
CREATE TABLE "attribution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"link_short_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"external_ref" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_shorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"publication_id" uuid,
	"slug" text NOT NULL,
	"destination_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"views" integer,
	"likes" integer,
	"comments" integer,
	"shares" integer,
	"watch_time_seconds" numeric(12, 2),
	"follows" integer,
	"profile_visits" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"goal" text NOT NULL,
	"spend_cap_usd" numeric(10, 2) NOT NULL,
	"spend_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text NOT NULL,
	"step_trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"condition" jsonb,
	"action" jsonb NOT NULL,
	"spend_cap_usd" numeric(10, 2),
	"is_dry_run" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"debit" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"reference_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"amount_usd" numeric(10, 2) NOT NULL,
	"status" text NOT NULL,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"plan_key" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"units" numeric(12, 4) NOT NULL,
	"cost_usd" numeric(10, 4) NOT NULL,
	"job_kind" text NOT NULL,
	"reference_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blitz_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"blitz_session_id" uuid NOT NULL,
	"content_concept_id" uuid NOT NULL,
	"direction" "swipe_direction" NOT NULL,
	"dwell_time_ms" integer NOT NULL,
	"preview_watched_to_completion" boolean DEFAULT false NOT NULL,
	"replay_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blitz_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"swipe_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_profile_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"product" text NOT NULL,
	"category" text NOT NULL,
	"one_liner" text,
	"icp_segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"differentiators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proof_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tone" jsonb,
	"visual" jsonb,
	"cta_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compliance_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_url" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_profile_id" uuid NOT NULL,
	"banned_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"banned_claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_disclaimers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "angles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"attributes" jsonb,
	"reference_image_storage_key" text,
	"consent_artefact_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trend_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"hook_pattern" text NOT NULL,
	"beat_timings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shot_grammar" text,
	"caption_cadence" text,
	"text_placement" text,
	"audio_archetype" text,
	"niche_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"velocity_score" numeric(6, 3) DEFAULT '0' NOT NULL,
	"source_ref" text,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"release_ref" text NOT NULL,
	"usage_territory" text,
	"usage_duration_months" integer,
	"usage_media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"angle_id" uuid NOT NULL,
	"format" "content_format" NOT NULL,
	"persona_id" uuid,
	"blueprint_id" uuid,
	"hook" text NOT NULL,
	"preview_asset_storage_key" text,
	"predicted_score" numeric(5, 4),
	"ai_generated" boolean DEFAULT true NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_concept_id" uuid NOT NULL,
	"text_plan_id" uuid NOT NULL,
	"status" "content_item_status" DEFAULT 'concept' NOT NULL,
	"ai_generated" boolean DEFAULT true NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hook_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"text_plan_id" uuid NOT NULL,
	"text" text NOT NULL,
	"pattern" text NOT NULL,
	"predicted_ctr" numeric(5, 4),
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storyboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_concept_id" uuid NOT NULL,
	"scenes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "text_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"plan" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"key" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"status" text NOT NULL,
	"policy_version" text NOT NULL,
	"reviewer_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"severity" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"scope" "role_scope" NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"workspace_type" "workspace_type" NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fonts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family" text NOT NULL,
	"weight" text NOT NULL,
	"has_italic" boolean DEFAULT false NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"source_kind" text NOT NULL,
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"output_storage_key" text,
	"cost_usd" numeric(10, 4) NOT NULL,
	"ai_generated" boolean DEFAULT true NOT NULL,
	"model_id" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"c2pa_manifest_ref" text,
	"model_watermark_preserved" boolean DEFAULT false NOT NULL,
	"qc_passed" boolean,
	"qc_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "text_style_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"font_id" uuid NOT NULL,
	"size_min" integer NOT NULL,
	"size_max" integer NOT NULL,
	"tracking" numeric(4, 3) DEFAULT '0' NOT NULL,
	"line_height" numeric(4, 3) DEFAULT '1.2' NOT NULL,
	"fill_color" text NOT NULL,
	"stroke_color" text,
	"stroke_width" integer,
	"plate_fill_color" text,
	"plate_radius" integer,
	"padding" integer DEFAULT 0 NOT NULL,
	"entrance_timing_curve" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid,
	"platform" "platform" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"content_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "publication_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"outcome" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"social_account_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "publication_status" DEFAULT 'pending' NOT NULL,
	"platform_post_id" text,
	"ai_label_set" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid,
	"recurrence_rule" text,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"social_account_id" uuid NOT NULL,
	"encrypted_payload" text NOT NULL,
	"kms_key_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_quota_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"social_account_id" uuid NOT NULL,
	"window_starts_at" timestamp with time zone NOT NULL,
	"window_seconds" integer NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"request_cap" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"external_account_id" text NOT NULL,
	"handle" text,
	"is_private" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response_status" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attribution_events" ADD CONSTRAINT "attribution_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_events" ADD CONSTRAINT "attribution_events_link_short_id_link_shorts_id_fk" FOREIGN KEY ("link_short_id") REFERENCES "public"."link_shorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_shorts" ADD CONSTRAINT "link_shorts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_shorts" ADD CONSTRAINT "link_shorts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blitz_events" ADD CONSTRAINT "blitz_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blitz_events" ADD CONSTRAINT "blitz_events_blitz_session_id_blitz_sessions_id_fk" FOREIGN KEY ("blitz_session_id") REFERENCES "public"."blitz_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blitz_events" ADD CONSTRAINT "blitz_events_content_concept_id_content_concepts_id_fk" FOREIGN KEY ("content_concept_id") REFERENCES "public"."content_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blitz_sessions" ADD CONSTRAINT "blitz_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_brand_profile_id_brand_profiles_id_fk" FOREIGN KEY ("brand_profile_id") REFERENCES "public"."brand_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_rules" ADD CONSTRAINT "brand_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_rules" ADD CONSTRAINT "brand_rules_brand_profile_id_brand_profiles_id_fk" FOREIGN KEY ("brand_profile_id") REFERENCES "public"."brand_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angles" ADD CONSTRAINT "angles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angles" ADD CONSTRAINT "angles_brand_profile_id_brand_profiles_id_fk" FOREIGN KEY ("brand_profile_id") REFERENCES "public"."brand_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_blueprints" ADD CONSTRAINT "trend_blueprints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD CONSTRAINT "ugc_clips_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_concepts" ADD CONSTRAINT "content_concepts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_concepts" ADD CONSTRAINT "content_concepts_angle_id_angles_id_fk" FOREIGN KEY ("angle_id") REFERENCES "public"."angles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_concepts" ADD CONSTRAINT "content_concepts_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_concepts" ADD CONSTRAINT "content_concepts_blueprint_id_trend_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."trend_blueprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_content_concept_id_content_concepts_id_fk" FOREIGN KEY ("content_concept_id") REFERENCES "public"."content_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_text_plan_id_text_plans_id_fk" FOREIGN KEY ("text_plan_id") REFERENCES "public"."text_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_variants" ADD CONSTRAINT "hook_variants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_variants" ADD CONSTRAINT "hook_variants_text_plan_id_text_plans_id_fk" FOREIGN KEY ("text_plan_id") REFERENCES "public"."text_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_content_concept_id_content_concepts_id_fk" FOREIGN KEY ("content_concept_id") REFERENCES "public"."content_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_plans" ADD CONSTRAINT "text_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reviews" ADD CONSTRAINT "moderation_reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_style_presets" ADD CONSTRAINT "text_style_presets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_style_presets" ADD CONSTRAINT "text_style_presets_font_id_fonts_id_fk" FOREIGN KEY ("font_id") REFERENCES "public"."fonts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_slots" ADD CONSTRAINT "calendar_slots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_slots" ADD CONSTRAINT "calendar_slots_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_slots" ADD CONSTRAINT "calendar_slots_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_quota_state" ADD CONSTRAINT "platform_quota_state_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_quota_state" ADD CONSTRAINT "platform_quota_state_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_workspace_user_idx" ON "memberships" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_idempotency_key_idx" ON "publications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_platform_external_id_idx" ON "social_accounts" USING btree ("platform","external_account_id");