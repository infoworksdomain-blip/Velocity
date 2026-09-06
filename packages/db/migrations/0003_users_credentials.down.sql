ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_platform_role_id_roles_id_fk";
ALTER TABLE "users" DROP COLUMN IF EXISTS "platform_role_id";
ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
