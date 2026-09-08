ALTER TABLE "webhook_deliveries" DROP COLUMN IF EXISTS "last_error";
ALTER TABLE "webhook_deliveries" DROP COLUMN IF EXISTS "next_retry_at";
