-- STEP 19: Billing. `subscriptions`/`invoices` already existed since
-- migration 0000, unused until now (the same repeated pattern this build
-- has hit every step since STEP 15) -- this migration adds the one
-- missing column (`stripe_customer_id`, safe as NOT NULL with no
-- default: the table has never been written to) and a new, real
-- workspace-scoped table for idempotent top-up-purchase tracking.

ALTER TABLE "subscriptions" ADD COLUMN "stripe_customer_id" text NOT NULL;
--> statement-breakpoint

CREATE TABLE "top_up_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"stripe_checkout_session_id" text NOT NULL,
	"credits_granted" integer NOT NULL,
	"amount_usd" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "top_up_purchases_checkout_session_idx" ON "top_up_purchases" ("stripe_checkout_session_id");
--> statement-breakpoint

ALTER TABLE "top_up_purchases" ADD CONSTRAINT "top_up_purchases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- === RLS (ADR 0003) ===
ALTER TABLE "top_up_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "top_up_purchases" FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "top_up_purchases"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "top_up_purchases" TO velocity_app;
