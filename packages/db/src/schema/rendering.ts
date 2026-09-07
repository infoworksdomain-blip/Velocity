import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS, idColumn, timestamps, vector, workspaceIdColumn } from "./_helpers";
import { contentItems } from "./content-production";
import { renderStatusEnum, renderStepStateEnum } from "./enums";
import { workspaces } from "./tenancy";

/**
 * One actual composition job and its output (STEP 8.4). Provenance columns
 * are C2 and are `not null` by design — a render without them is not a
 * valid render, not an edge case to handle downstream.
 *
 * `costUsd` defaults to '0' and is accumulated by each render_steps
 * transition as the workflow runs (STEP 8 schema gap fix 3) — the final
 * cost isn't known when the row is first inserted at `resolveAssets` time,
 * but `modelId`/`promptHash` are (the router has already selected the
 * primary provider and the prompt hash is computed from storyboard + text
 * plan + persona), so the row is created there, not left absent until the
 * workflow finishes.
 */
export const renders = pgTable("renders", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  contentItemId: uuid("content_item_id")
    .notNull()
    .references(() => contentItems.id),
  status: renderStatusEnum("status").notNull().default("pending"),
  temporalWorkflowId: text("temporal_workflow_id"),
  temporalRunId: text("temporal_run_id"),
  providerId: text("provider_id").notNull(),
  outputStorageKey: text("output_storage_key"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  aiGenerated: boolean("ai_generated").notNull().default(true),
  modelId: text("model_id").notNull(),
  promptHash: text("prompt_hash").notNull(),
  c2paManifestRef: text("c2pa_manifest_ref"),
  c2paSigned: boolean("c2pa_signed").notNull().default(false),
  modelWatermarkPreserved: boolean("model_watermark_preserved").notNull().default(false),
  phash: text("phash"),
  durationMs: integer("duration_ms"),
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
  formatPlan: jsonb("format_plan"),
  qcPassed: boolean("qc_passed"),
  qcNotes: jsonb("qc_notes").$type<string[]>().notNull().default([]),
  ...timestamps(),
});

/**
 * The idempotency ledger (STEP 8.4, ADR 0006). One row per logical render
 * step. `stepKey` is deterministic and content-addressed — derived from the
 * step's own input, not a random id — so a retried activity re-derives the
 * same key, hits the unique index below, and finds its prior result instead
 * of re-calling (and re-billing) a provider. See ADR 0006 for the full
 * mechanism and why this is what "a killed worker resumes without duplicate
 * spend" actually reduces to.
 */
export const renderSteps = pgTable(
  "render_steps",
  {
    id: idColumn(),
    workspaceId: workspaceIdColumn().references(() => workspaces.id),
    renderId: uuid("render_id")
      .notNull()
      .references(() => renders.id),
    stepKey: text("step_key").notNull(),
    stepKind: text("step_kind").notNull(),
    state: renderStepStateEnum("state").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    providerId: text("provider_id"),
    externalJobId: text("external_job_id"),
    inputHash: text("input_hash"),
    outputRef: text("output_ref"),
    output: jsonb("output"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    providerReportedCostUsd: numeric("provider_reported_cost_usd", { precision: 10, scale: 4 }),
    usageEventId: uuid("usage_event_id"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("render_steps_render_step_key_idx").on(table.renderId, table.stepKey)],
);

export const mediaAssets = pgTable("media_assets", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").notNull(),
  sourceKind: text("source_kind").notNull(), // brand_asset | generated_still | render_output | licensed_clip
  sizeBytes: integer("size_bytes"),
  /** Nullable — only set for a media asset filed from a completed render. */
  renderId: uuid("render_id").references(() => renders.id),
  stepKey: text("step_key"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  licenceRef: text("licence_ref"),
  licenceTerms: jsonb("licence_terms").$type<Record<string, unknown>>(),
  checksumSha256: text("checksum_sha256"),
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
  durationMs: integer("duration_ms"),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
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
