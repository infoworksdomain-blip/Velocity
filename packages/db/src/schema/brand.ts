import { integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS, idColumn, timestamps, vector, workspaceIdColumn } from "./_helpers";
import { workspaces } from "./tenancy";

/**
 * Versioned brand extraction (STEP 6). A new BrandProfile version is a new
 * row, never an in-place update — the Brand Manager's diff/version-history
 * UI depends on old versions surviving.
 */
export const brandProfiles = pgTable("brand_profiles", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  version: integer("version").notNull(),
  product: text("product").notNull(),
  category: text("category").notNull(),
  oneLiner: text("one_liner"),
  icpSegments: jsonb("icp_segments").$type<string[]>().notNull().default([]),
  pains: jsonb("pains").$type<string[]>().notNull().default([]),
  benefits: jsonb("benefits").$type<string[]>().notNull().default([]),
  differentiators: jsonb("differentiators").$type<string[]>().notNull().default([]),
  proofPoints: jsonb("proof_points").$type<string[]>().notNull().default([]),
  tone: jsonb("tone").$type<{ voice: string; formality: string; humour: boolean; bannedWords: string[] }>(),
  visual: jsonb("visual").$type<{ palette: string[]; logoUrl: string | null; fonts: string[] }>(),
  ctaVariants: jsonb("cta_variants").$type<string[]>().notNull().default([]),
  competitors: jsonb("competitors").$type<string[]>().notNull().default([]),
  complianceNotes: jsonb("compliance_notes").$type<string[]>().notNull().default([]),
  sourceUrl: text("source_url").notNull(),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  ...timestamps(),
});

export const brandAssets = pgTable("brand_assets", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  brandProfileId: uuid("brand_profile_id")
    .notNull()
    .references(() => brandProfiles.id),
  storageKey: text("storage_key").notNull(),
  kind: text("kind").notNull(), // logo | screenshot | uploaded_asset
  ...timestamps(),
});

/** Banned words/claims/required disclaimers — the STEP 8B.4 brand-rule check reads this table directly. */
export const brandRules = pgTable("brand_rules", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  brandProfileId: uuid("brand_profile_id")
    .notNull()
    .references(() => brandProfiles.id),
  bannedWords: jsonb("banned_words").$type<string[]>().notNull().default([]),
  bannedClaims: jsonb("banned_claims").$type<string[]>().notNull().default([]),
  requiredDisclaimers: jsonb("required_disclaimers").$type<string[]>().notNull().default([]),
  ...timestamps(),
});
