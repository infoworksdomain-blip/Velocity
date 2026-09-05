import { integer, jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS, idColumn, softDelete, timestamps, vector, workspaceIdColumn } from "./_helpers";
import { brandProfiles } from "./brand";
import { workspaces } from "./tenancy";

export const angles = pgTable("angles", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  brandProfileId: uuid("brand_profile_id")
    .notNull()
    .references(() => brandProfiles.id),
  kind: text("kind").notNull(), // pain_led | transformation | comparison | myth_bust | pov | listicle | founder_story | social_proof | objection_handling | meme
  description: text("description").notNull(),
  ...timestamps(),
});

/**
 * Structure only — never source footage (C3). `sourceRef` is an opaque,
 * non-dereferenceable identifier for provenance/audit purposes; it is not a
 * playable URL and application code must never resolve it into media.
 */
export const trendBlueprints = pgTable("trend_blueprints", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  hookPattern: text("hook_pattern").notNull(),
  beatTimings: jsonb("beat_timings").$type<number[]>().notNull().default([]),
  shotGrammar: text("shot_grammar"),
  captionCadence: text("caption_cadence"),
  textPlacement: text("text_placement"),
  audioArchetype: text("audio_archetype"),
  nicheTags: jsonb("niche_tags").$type<string[]>().notNull().default([]),
  velocityScore: numeric("velocity_score", { precision: 6, scale: 3 }).notNull().default("0"),
  sourceRef: text("source_ref"),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  ...timestamps(),
});

export const personas = pgTable("personas", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  name: text("name").notNull(),
  attributes: jsonb("attributes").$type<{
    ageBand?: string;
    genderPresentation?: string;
    style?: string;
    setting?: string;
    energy?: string;
  }>(),
  referenceImageStorageKey: text("reference_image_storage_key"),
  /**
   * Nullable = no consent artefact on file. Generation against this persona
   * must be blocked in application code whenever this is null AND the
   * persona is modeling a real identifiable person (STEP 15 hard
   * requirement) — enforced at the service layer, not by a DB constraint,
   * since "models a real person" isn't something a CHECK can determine.
   */
  consentArtefactRef: text("consent_artefact_ref"),
  ...timestamps(),
  ...softDelete(),
});

export const ugcClips = pgTable("ugc_clips", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  storageKey: text("storage_key").notNull(),
  /** Required — a licence/model-release reference. Not nullable: STEP 15 requires every clip to resolve to a licence record before it can be selected. */
  releaseRef: text("release_ref").notNull(),
  usageTerritory: text("usage_territory"),
  usageDurationMonths: integer("usage_duration_months"),
  usageMedia: jsonb("usage_media").$type<string[]>().notNull().default([]),
  ...timestamps(),
});
