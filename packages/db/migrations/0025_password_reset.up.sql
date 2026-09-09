-- Post-STEP-22 audit remediation: a real password-reset flow. Platform-
-- root (no workspace_id, no RLS) — a reset token belongs to a user, not a
-- workspace, same shape as sessions/mfa_credentials from migration 0002.
-- Only the SHA-256 hash of the token is ever stored, never the raw token.

CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_idx" ON "password_reset_tokens" ("token_hash");
--> statement-breakpoint

CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" ("user_id");
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "password_reset_tokens" TO velocity_app;
