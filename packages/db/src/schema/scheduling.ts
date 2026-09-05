import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, softDelete, timestamps, workspaceIdColumn } from "./_helpers";
import { contentItems } from "./content-production";
import { platformEnum, publicationStatusEnum } from "./enums";
import { socialAccounts } from "./social";
import { workspaces } from "./tenancy";

export const campaigns = pgTable("campaigns", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  name: text("name").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  ...timestamps(),
  ...softDelete(),
});

export const calendarSlots = pgTable("calendar_slots", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  platform: platformEnum("platform").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  contentItemId: uuid("content_item_id").references(() => contentItems.id),
  ...timestamps(),
  ...softDelete(),
});

/** A recurrence/auto-fill rule that produces calendar_slots — distinct from the slots themselves. */
export const schedules = pgTable("schedules", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  recurrenceRule: text("recurrence_rule"), // RFC 5545 RRULE string, or null for a one-shot auto-fill run
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
  ...timestamps(),
});

/**
 * Current state of a publish attempt sequence. `idempotencyKey` is
 * unique-indexed — this is the mechanical enforcement behind "retries never
 * double-post" (STEP 12).
 */
export const publications = pgTable("publications", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  contentItemId: uuid("content_item_id")
    .notNull()
    .references(() => contentItems.id),
  socialAccountId: uuid("social_account_id")
    .notNull()
    .references(() => socialAccounts.id),
  idempotencyKey: text("idempotency_key").notNull(),
  status: publicationStatusEnum("status").notNull().default("pending"),
  platformPostId: text("platform_post_id"),
  aiLabelSet: boolean("ai_label_set").notNull().default(false), // records that the platform-native AI-generated label was set on publish (C2)
  ...timestamps(),
}, (table) => [uniqueIndex("publications_idempotency_key_idx").on(table.idempotencyKey)]);

/** Append-only attempt log; `publications` above holds current state. */
export const publicationAttempts = pgTable("publication_attempts", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  publicationId: uuid("publication_id")
    .notNull()
    .references(() => publications.id),
  attemptNumber: integer("attempt_number").notNull(),
  outcome: text("outcome").notNull(), // transient_failure | terminal_failure | quota_deferred | succeeded
  errorMessage: text("error_message"),
  ...timestamps(),
});
