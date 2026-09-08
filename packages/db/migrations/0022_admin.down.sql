DROP TABLE IF EXISTS "ai_router_settings";
DROP TABLE IF EXISTS "ai_provider_configs";
ALTER TABLE "users" DROP COLUMN IF EXISTS "suspended_reason";
ALTER TABLE "users" DROP COLUMN IF EXISTS "suspended_at";
ALTER TABLE "feature_flags" DROP CONSTRAINT IF EXISTS "feature_flags_user_id_users_id_fk";
ALTER TABLE "feature_flags" DROP COLUMN IF EXISTS "user_id";
