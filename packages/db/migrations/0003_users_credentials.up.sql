ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_platform_role_id_roles_id_fk" FOREIGN KEY ("platform_role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;