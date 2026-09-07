-- STEP 12: the publish pipeline's idempotency ledger — the same
-- claim-before-side-effect pattern as render_steps (STEP 8.4), scoped to
-- publications instead of renders.
CREATE TABLE "publication_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"step_kind" text NOT NULL,
	"state" "render_step_state" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"external_job_id" text,
	"upload_target" text,
	"output" jsonb,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publication_steps" ADD CONSTRAINT "publication_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_steps" ADD CONSTRAINT "publication_steps_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publication_steps_publication_step_key_idx" ON "publication_steps" USING btree ("publication_id","step_key");

-- === RLS (ADR 0003) ===
-- publication_steps is workspace-scoped and new — migration 0001's loop
-- only ran once, over tables that existed then; every later
-- workspace-scoped table must add its own ENABLE/FORCE/POLICY (see
-- 0007_render_pipeline.up.sql's render_steps for the identical pattern).
ALTER TABLE "publication_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "publication_steps" FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "publication_steps"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "publication_steps" TO velocity_app;
