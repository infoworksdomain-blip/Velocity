import { boolean, integer, jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, workspaceIdColumn } from "./_helpers";
import { contentItems } from "./content-production";
import { workspaces } from "./tenancy";

/**
 * One actual composition job and its output (STEP 8.4). Provenance columns
 * are C2 and are `not null` by design — a render without them is not a
 * valid render, not an edge case to handle downstream.
 */
export const renders = pgTable("renders", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  contentItemId: uuid("content_item_id")
    .notNull()
    .references(() => contentItems.id),
  providerId: text("provider_id").notNull(),
  outputStorageKey: text("output_storage_key"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull(),
  aiGenerated: boolean("ai_generated").notNull().default(true),
  modelId: text("model_id").notNull(),
  promptHash: text("prompt_hash").notNull(),
  c2paManifestRef: text("c2pa_manifest_ref"),
  modelWatermarkPreserved: boolean("model_watermark_preserved").notNull().default(false),
  qcPassed: boolean("qc_passed"),
  qcNotes: jsonb("qc_notes").$type<string[]>().notNull().default([]),
  ...timestamps(),
});

export const mediaAssets = pgTable("media_assets", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").notNull(),
  sourceKind: text("source_kind").notNull(), // brand_asset | generated_still | render_output | licensed_clip
  sizeBytes: integer("size_bytes"),
  ...timestamps(),
});

/** Platform-root (not tenant-scoped) — shared font library used across all workspaces' text_style_presets. */
export const fonts = pgTable("fonts", {
  id: idColumn(),
  family: text("family").notNull(),
  weight: text("weight").notNull(),
  hasItalic: boolean("has_italic").notNull().default(false),
  storageKey: text("storage_key").notNull(),
  ...timestamps(),
});

export const textStylePresets = pgTable("text_style_presets", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  name: text("name").notNull(),
  fontId: uuid("font_id")
    .notNull()
    .references(() => fonts.id),
  sizeMin: integer("size_min").notNull(),
  sizeMax: integer("size_max").notNull(),
  tracking: numeric("tracking", { precision: 4, scale: 3 }).notNull().default("0"),
  lineHeight: numeric("line_height", { precision: 4, scale: 3 }).notNull().default("1.2"),
  fillColor: text("fill_color").notNull(),
  strokeColor: text("stroke_color"),
  strokeWidth: integer("stroke_width"),
  plateFillColor: text("plate_fill_color"),
  plateRadius: integer("plate_radius"),
  padding: integer("padding").notNull().default(0),
  entranceTimingCurve: text("entrance_timing_curve"),
  ...timestamps(),
});
