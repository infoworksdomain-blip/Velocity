DROP TABLE IF EXISTS "top_up_purchases";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "stripe_customer_id";
