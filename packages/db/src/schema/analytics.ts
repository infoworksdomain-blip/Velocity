import { integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, workspaceIdColumn } from "./_helpers";
import { publications } from "./scheduling";
import { workspaces } from "./tenancy";

export const metricSnapshots = pgTable("metric_snapshots", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  publicationId: uuid("publication_id")
    .notNull()
    .references(() => publications.id),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  views: integer("views"),
  likes: integer("likes"),
  comments: integer("comments"),
  shares: integer("shares"),
  watchTimeSeconds: numeric("watch_time_seconds", { precision: 12, scale: 2 }),
  follows: integer("follows"),
  profileVisits: integer("profile_visits"),
  ...timestamps(),
});

export const attributionEvents = pgTable("attribution_events", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  linkShortId: uuid("link_short_id")
    .notNull()
    .references(() => linkShorts.id),
  eventType: text("event_type").notNull(), // click | signup | conversion
  externalRef: text("external_ref"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const linkShorts = pgTable("link_shorts", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  publicationId: uuid("publication_id").references(() => publications.id),
  slug: text("slug").notNull(),
  destinationUrl: text("destination_url").notNull(),
  ...timestamps(),
});
