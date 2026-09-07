ALTER TABLE "personas" ADD COLUMN "consent_artefact_ref" text;--> statement-breakpoint
ALTER TABLE "personas" DROP CONSTRAINT IF EXISTS "personas_consent_artefact_id_consent_artefacts_id_fk";--> statement-breakpoint
ALTER TABLE "personas" DROP COLUMN IF EXISTS "consent_artefact_id";--> statement-breakpoint
ALTER TABLE "personas" DROP COLUMN IF EXISTS "models_real_person";--> statement-breakpoint
DROP TABLE IF EXISTS "consent_artefacts";
