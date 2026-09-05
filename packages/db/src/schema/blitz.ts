import { boolean, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, workspaceIdColumn } from "./_helpers";
import { contentConcepts } from "./content-production";
import { swipeDirectionEnum } from "./enums";
import { workspaces } from "./tenancy";

export const blitzSessions = pgTable("blitz_sessions", {
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
export const blitzEvents = pgTable("blitz_events", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  blitzSessionId: uuid("blitz_session_id")
    .notNull()
    .references(() => blitzSessions.id),
  contentConceptId: uuid("content_concept_id")
    .notNull()
    .references(() => contentConcepts.id),
  direction: swipeDirectionEnum("direction").notNull(),
  dwellTimeMs: integer("dwell_time_ms").notNull(),
  previewWatchedToCompletion: boolean("preview_watched_to_completion").notNull().default(false),
  replayCount: integer("replay_count").notNull().default(0),
  ...timestamps(),
});
