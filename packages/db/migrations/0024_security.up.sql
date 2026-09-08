-- STEP 20: a real, generic rate limiter (build script: "rate limiting and
-- abuse — signup velocity, generation abuse, API-key abuse"). Platform-
-- root, like ai_provider_configs/partners -- no workspace_id, no RLS
-- (signup-velocity limiting in particular must work before any workspace
-- exists).

CREATE TABLE "rate_limit_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_key" text NOT NULL,
	"window_starts_at" timestamp with time zone NOT NULL,
	"window_seconds" integer NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"request_cap" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "rate_limit_buckets_bucket_key_idx" ON "rate_limit_buckets" ("bucket_key");
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limit_buckets" TO velocity_app;
