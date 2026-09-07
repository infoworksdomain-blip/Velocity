import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS, idColumn, softDelete, timestamps, vector, workspaceIdColumn } from "./_helpers";
import { brandProfiles } from "./brand";
import { competitors } from "./growth-brain";
import { users, workspaces } from "./tenancy";

/**
 * Platform-root corpus (STEP 8.3, ADR 0007) — ingestion is "per niche," not
 * per workspace, so this holds one copy of each blueprint globally rather
 * than duplicating the corpus N times across tenants. No workspace_id, no
 * RLS: it carries no tenant data, only structure extracted from public
 * trend signals (C3 — never source footage). `trendBlueprints` below is the
 * per-workspace adopted copy, written lazily on first retrieval, carrying
 * `libraryId` back to this table for lineage.
 */
export const trendBlueprintLibrary = pgTable("trend_blueprint_library", {
  id: idColumn(),
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
  /** Lineage back to the platform-root corpus this was adopted from — null for a workspace-specific blueprint never sourced from the shared library. */
  libraryId: uuid("library_id").references(() => trendBlueprintLibrary.id),
  /** STEP 14: set when this blueprint was extracted from a tracked competitor's public account rather than organic trend discovery — null for the latter. */
  competitorId: uuid("competitor_id").references(() => competitors.id),
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

/**
 * A real, verifiable consent artefact (STEP 15) — "built as a first-class
 * object with the release document attached," per the build script,
 * not an opaque string. `documentStorageKey` points at the actual signed
 * release document; `expiresAt` is nullable because a real release can be
 * open-ended or time-boxed depending on what the subject actually signed.
 */
export const consentArtefacts = pgTable("consent_artefacts", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  subjectName: text("subject_name").notNull(),
  documentStorageKey: text("document_storage_key").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  verifiedByUserId: uuid("verified_by_user_id").references(() => users.id),
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
   * Explicitly declared at creation time — "models a real person" is a
   * workspace decision this codebase must be TOLD, not one it can infer
   * from a reference image alone. Drives the STEP 15 hard requirement:
   * generation is blocked in application code whenever this is true AND
   * `consentArtefactId` is null, never inferred silently either way.
   */
  modelsRealPerson: boolean("models_real_person").notNull().default(false),
  /** Real FK to a verifiable consent_artefacts row — replaces an earlier opaque text reference (never used by any real code path) with the actual first-class object the build script requires. */
  consentArtefactId: uuid("consent_artefact_id").references(() => consentArtefacts.id),
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
