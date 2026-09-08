-- STEP 17: Agency, White-label, Creator Marketplace. Real access control
-- for Agency Mode and the Client Portal needed NO new schema at all --
-- STEP 3 already seeded the `agency_manager` and `client` workspace
-- roles with real `agency:manage_clients:workspace` and
-- `client_portal:approve:workspace` permissions in the real permission
-- catalogue, simply unused by any router until now. Everything below is
-- the new BUSINESS layer: partner/client relationships, white-label
-- branding, and the Creator Marketplace.
CREATE TYPE "public"."marketplace_engagement_status" AS ENUM('briefed', 'accepted', 'delivered', 'approved', 'rejected', 'paid', 'cancelled');
--> statement-breakpoint

CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "partner_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"budget_cap_usd" numeric(10, 2),
	"margin_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "white_label_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"custom_domain" text,
	"domain_verified_at" timestamp with time zone,
	"logo_storage_key" text,
	"palette" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"email_sender_domain" text,
	"remove_branding" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "white_label_configs_partner_id_unique" UNIQUE("partner_id")
);
--> statement-breakpoint

CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"rate_usd" numeric(10, 2),
	"identity_verified_at" timestamp with time zone,
	"payout_details_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "marketplace_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"brief_text" text NOT NULL,
	"rate_usd" numeric(10, 2) NOT NULL,
	"status" "public"."marketplace_engagement_status" DEFAULT 'briefed' NOT NULL,
	"contract_ref" text,
	"deliverable_storage_key" text,
	"paid_partnership_disclosure" boolean DEFAULT false NOT NULL,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "marketplace_escrow_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"debit" numeric(10, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(10, 2) DEFAULT '0' NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "partner_clients" ADD CONSTRAINT "partner_clients_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "partner_clients" ADD CONSTRAINT "partner_clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "white_label_configs" ADD CONSTRAINT "white_label_configs_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketplace_engagements" ADD CONSTRAINT "marketplace_engagements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketplace_engagements" ADD CONSTRAINT "marketplace_engagements_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketplace_escrow_ledger" ADD CONSTRAINT "marketplace_escrow_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketplace_escrow_ledger" ADD CONSTRAINT "marketplace_escrow_ledger_engagement_id_marketplace_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."marketplace_engagements"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "partner_clients_partner_workspace_idx" ON "partner_clients" ("partner_id", "workspace_id");

-- === RLS (ADR 0003) ===
-- partners/creators are platform-root, like organisations/users — no
-- workspace_id, no RLS. partner_clients/marketplace_engagements/
-- marketplace_escrow_ledger are new workspace-scoped tables and need
-- their own real ENABLE/FORCE/POLICY (migration 0001's dynamic sweep
-- only ran once, over tables that existed at that time).
ALTER TABLE "partner_clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_clients" FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "partner_clients"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "marketplace_engagements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketplace_engagements" FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "marketplace_engagements"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "marketplace_escrow_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketplace_escrow_ledger" FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "marketplace_escrow_ledger"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "partners" TO velocity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "partner_clients" TO velocity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "white_label_configs" TO velocity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "creators" TO velocity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "marketplace_engagements" TO velocity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "marketplace_escrow_ledger" TO velocity_app;

-- marketplace_escrow_ledger is append-only, double-entry -- the exact
-- same real discipline as credit_ledger (STEP 2 design decision 3): no
-- code path can express "change a past movement," only "record a new
-- one," enforced at the grant level, not just by application convention.
REVOKE UPDATE, DELETE ON "marketplace_escrow_ledger" FROM velocity_app;
