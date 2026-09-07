CREATE TYPE "public"."render_status" AS ENUM('pending', 'running', 'qc_failed', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."render_step_state" AS ENUM('pending', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "trend_blueprint_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "render_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"render_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"step_kind" text NOT NULL,
	"state" "render_step_state" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	"external_job_id" text,
	"input_hash" text,
	"output_ref" text,
	"output" jsonb,
	"cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"provider_reported_cost_usd" numeric(10, 4),
	"usage_event_id" uuid,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renders" ALTER COLUMN "cost_usd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "trend_blueprints" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "content_concepts" ADD COLUMN "text_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "render_id" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "step_key" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "licence_ref" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "licence_terms" jsonb;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "checksum_sha256" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "width_px" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "height_px" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "status" "render_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "temporal_workflow_id" text;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "temporal_run_id" text;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "c2pa_signed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "phash" text;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "width_px" integer;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "height_px" integer;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "format_plan" jsonb;--> statement-breakpoint
ALTER TABLE "render_steps" ADD CONSTRAINT "render_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_steps" ADD CONSTRAINT "render_steps_render_id_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."renders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "render_steps_render_step_key_idx" ON "render_steps" USING btree ("render_id","step_key");--> statement-breakpoint
ALTER TABLE "trend_blueprints" ADD CONSTRAINT "trend_blueprints_library_id_trend_blueprint_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."trend_blueprint_library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_concepts" ADD CONSTRAINT "content_concepts_text_plan_id_text_plans_id_fk" FOREIGN KEY ("text_plan_id") REFERENCES "public"."text_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_render_id_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."renders"("id") ON DELETE no action ON UPDATE no action;

-- === RLS (ADR 0003) ===
-- render_steps is workspace-scoped and new — migration 0001's loop only ran
-- once, over tables that existed then; every later workspace-scoped table
-- must add its own ENABLE/FORCE/POLICY (see 0006_notifications.up.sql for
-- the same pattern).
ALTER TABLE "render_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "render_steps" FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "render_steps"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- trend_blueprint_library is platform-root (ADR 0007) — it carries no
-- tenant data (only structure extracted from public trend signals, C3), so
-- it gets no RLS. The app role can read it (every workspace's retrieval
-- query needs it) but never write it — ingestion writes through the admin
-- connection only.
GRANT SELECT ON "trend_blueprint_library" TO velocity_app;

-- === Grants for the new workspace-scoped table ===
GRANT SELECT, INSERT, UPDATE, DELETE ON "render_steps" TO velocity_app;