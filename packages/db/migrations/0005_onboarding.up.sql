CREATE TABLE "onboarding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"workspace_id" uuid,
	"stage" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Deliberately not RLS-protected (see schema/onboarding.ts) — platform-root,
-- same shape as audit_logs' platform-level rows. Still needs the baseline
-- grant every other table got in 0001, since that loop ran before this
-- table existed.
GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding_events TO velocity_app;
