-- STEP 15: a real, first-class consent artefact object (build script:
-- "built as a first-class object with the release document attached and
-- generation blocked without it") — replaces personas' earlier opaque
-- text reference, which no real code path ever used.
CREATE TABLE "consent_artefacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_name" text NOT NULL,
	"document_storage_key" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_artefacts" ADD CONSTRAINT "consent_artefacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_artefacts" ADD CONSTRAINT "consent_artefacts_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "personas" ADD COLUMN "models_real_person" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "consent_artefact_id" uuid;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_consent_artefact_id_consent_artefacts_id_fk" FOREIGN KEY ("consent_artefact_id") REFERENCES "public"."consent_artefacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" DROP COLUMN IF EXISTS "consent_artefact_ref";

-- === RLS (ADR 0003) ===
-- consent_artefacts is workspace-scoped and new — migration 0001's loop
-- only ran once, over tables that existed then; every later workspace-
-- scoped table must add its own ENABLE/FORCE/POLICY.
ALTER TABLE "consent_artefacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_artefacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "consent_artefacts"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "consent_artefacts" TO velocity_app;
