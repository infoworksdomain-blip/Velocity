ALTER TABLE "organisations" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;