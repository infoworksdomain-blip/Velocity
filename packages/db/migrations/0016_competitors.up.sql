-- STEP 14: Competitor Intelligence — a named public account this
-- workspace tracks, plus the blueprint lineage back to it.
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"external_ref" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_blueprints" ADD COLUMN "competitor_id" uuid;--> statement-breakpoint
ALTER TABLE "trend_blueprints" ADD CONSTRAINT "trend_blueprints_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trend_blueprints_competitor_id_idx" ON "trend_blueprints" USING btree ("competitor_id");

-- === RLS (ADR 0003) ===
-- competitors is workspace-scoped and new — migration 0001's loop only
-- ran once, over tables that existed then; every later workspace-scoped
-- table must add its own ENABLE/FORCE/POLICY.
ALTER TABLE "competitors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competitors" FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "competitors"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "competitors" TO velocity_app;
