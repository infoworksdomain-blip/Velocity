ALTER TABLE "media_assets" DROP CONSTRAINT IF EXISTS "media_assets_render_id_renders_id_fk";
ALTER TABLE "content_concepts" DROP CONSTRAINT IF EXISTS "content_concepts_text_plan_id_text_plans_id_fk";
ALTER TABLE "trend_blueprints" DROP CONSTRAINT IF EXISTS "trend_blueprints_library_id_trend_blueprint_library_id_fk";

ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "render_id";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "step_key";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "tags";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "licence_ref";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "licence_terms";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "checksum_sha256";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "width_px";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "height_px";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "duration_ms";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "embedding";

ALTER TABLE "renders" DROP COLUMN IF EXISTS "status";
ALTER TABLE "renders" DROP COLUMN IF EXISTS "temporal_workflow_id";
ALTER TABLE "renders" DROP COLUMN IF EXISTS "temporal_run_id";
ALTER TABLE "renders" DROP COLUMN IF EXISTS "c2pa_signed";
ALTER TABLE "renders" DROP COLUMN IF EXISTS "phash";
ALTER TABLE "renders" DROP COLUMN IF EXISTS "duration_ms";
ALTER TABLE "renders" DROP COLUMN IF EXISTS "width_px";
ALTER TABLE "renders" DROP COLUMN IF EXISTS "height_px";
ALTER TABLE "renders" DROP COLUMN IF EXISTS "format_plan";
ALTER TABLE "renders" ALTER COLUMN "cost_usd" DROP DEFAULT;

ALTER TABLE "content_concepts" DROP COLUMN IF EXISTS "text_plan_id";
ALTER TABLE "trend_blueprints" DROP COLUMN IF EXISTS "library_id";

DROP TABLE IF EXISTS "render_steps" CASCADE;
DROP TABLE IF EXISTS "trend_blueprint_library" CASCADE;

DROP TYPE IF EXISTS "public"."render_status";
DROP TYPE IF EXISTS "public"."render_step_state";
