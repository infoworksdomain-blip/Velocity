import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, workspaceIdColumn } from "./_helpers";
import { contentConcepts } from "./content-production";
import { swipeDirectionEnum } from "./enums";
import { workspaces } from "./tenancy";

export const velocitySessions = pgTable("velocity_sessions", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  userId: uuid("user_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  swipeCount: integer("swipe_count").notNull().default(0),
});

/**
 * Append-only swipe telemetry (STEP 9). `dwellTimeMs` is `not null` on
 * purpose — the build script calls it out as the highest-value signal and
 * "the one most implementations forget to log," so it isn't optional here.
 */
export const velocityEvents = pgTable(
  "velocity_events",
  {
    id: idColumn(),
    workspaceId: workspaceIdColumn().references(() => workspaces.id),
    velocitySessionId: uuid("velocity_session_id")
      .notNull()
      .references(() => velocitySessions.id),
    contentConceptId: uuid("content_concept_id")
      .notNull()
      .references(() => contentConcepts.id),
    direction: swipeDirectionEnum("direction").notNull(),
    dwellTimeMs: integer("dwell_time_ms").notNull(),
    previewWatchedToCompletion: boolean("preview_watched_to_completion").notNull().default(false),
    replayCount: integer("replay_count").notNull().default(0),
    ...timestamps(),
  },
  // The queue's "exclude already-swiped concepts" query (STEP 9) is a NOT
  // EXISTS anti-join on this exact column — Postgres does not auto-index a
  // plain FK column (only the referenced side gets one), so without this
  // the anti-join degrades to a sequential scan as velocity_events grows.
  (table) => [index("velocity_events_content_concept_id_idx").on(table.contentConceptId)],
);

/**
 * Per-workspace Thompson-sampling (Beta-Bernoulli) bandit state (STEP 9,
 * build script: "Thompson sampling over angle x format x persona x
 * blueprint x hook_pattern arms. Per-workspace preference vector.").
 * One row per (workspace, dimension) arm — e.g. dimensionKey
 * "angle:pain_led" or "hook_pattern:curiosity_gap" — rather than one row
 * per full 5-dimension combination: a joint arm over the full Cartesian
 * product would see so few swipes per unique combination that its
 * posterior would barely move from the uniform prior even after hundreds
 * of swipes (real bandit systems commonly decompose a high-cardinality
 * joint arm into independent per-dimension arms combined at ranking time
 * for exactly this reason — see packages/core/src/velocity/bandit.ts).
 * alpha/beta start at 1 (a uniform Beta(1,1) prior) and accumulate real
 * swipe counts: alpha += 1 on a right swipe, beta += 1 on a left swipe.
 */
export const velocityPreferences = pgTable(
  "velocity_preferences",
  {
    id: idColumn(),
    workspaceId: workspaceIdColumn().references(() => workspaces.id),
    dimensionKey: text("dimension_key").notNull(),
    alpha: integer("alpha").notNull().default(1),
    beta: integer("beta").notNull().default(1),
    ...timestamps(),
  },
  (table) => [uniqueIndex("velocity_preferences_workspace_dimension_idx").on(table.workspaceId, table.dimensionKey)],
);
