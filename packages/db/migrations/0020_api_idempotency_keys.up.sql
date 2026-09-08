-- STEP 16: generic Idempotency-Key support for the Public API. A new
-- workspace-scoped table, so it needs its own ENABLE/FORCE/POLICY block —
-- migration 0001's dynamic sweep only ran once, over tables that existed
-- at that time.
CREATE TABLE "api_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status_code" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "api_idempotency_keys_workspace_key_idx" ON "api_idempotency_keys" ("workspace_id", "idempotency_key");

ALTER TABLE "api_idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_idempotency_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "api_idempotency_keys"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "api_idempotency_keys" TO velocity_app;
