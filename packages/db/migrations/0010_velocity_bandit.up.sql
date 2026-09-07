-- STEP 9: the Velocity swipe queue's bandit state + a hook_pattern arm
-- dimension on content_concepts, plus the index the queue's "exclude
-- already-swiped concepts" anti-join needs (see schema/velocity.ts's own
-- comment on why a plain FK column isn't auto-indexed).

ALTER TABLE "content_concepts" ADD COLUMN "hook_pattern" text;--> statement-breakpoint

CREATE TABLE "velocity_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"dimension_key" text NOT NULL,
	"alpha" integer DEFAULT 1 NOT NULL,
	"beta" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "velocity_preferences" ADD CONSTRAINT "velocity_preferences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "velocity_preferences_workspace_dimension_idx" ON "velocity_preferences" USING btree ("workspace_id","dimension_key");--> statement-breakpoint
CREATE INDEX "velocity_events_content_concept_id_idx" ON "velocity_events" USING btree ("content_concept_id");--> statement-breakpoint

-- === RLS (ADR 0003) — velocity_preferences is workspace-scoped and new;
-- migration 0001's loop only ran once, over tables that existed then (see
-- 0006/0007's own migrations for the same pattern).
ALTER TABLE "velocity_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "velocity_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY workspace_isolation ON "velocity_preferences"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "velocity_preferences" TO velocity_app;
