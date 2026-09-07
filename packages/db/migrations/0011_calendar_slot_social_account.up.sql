-- STEP 10: calendar_slots gains social_account_id — C6's per-account rate
-- caps and the auto-fill's double-booking/spacing checks need to know
-- WHICH account a slot targets, not just which platform (a workspace can
-- run more than one account per platform).
ALTER TABLE "calendar_slots" ADD COLUMN "social_account_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_slots" ADD CONSTRAINT "calendar_slots_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_slots_social_account_id_idx" ON "calendar_slots" USING btree ("social_account_id");
