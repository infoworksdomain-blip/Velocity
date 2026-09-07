import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, softDelete, timestamps, workspaceIdColumn } from "./_helpers";
import { contentItems } from "./content-production";
import { platformEnum, publicationStatusEnum, renderStepStateEnum } from "./enums";
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
  /**
   * STEP 10 addition: a workspace can have more than one account on the
   * same platform (build script's own "5 accounts" across "3 platforms"
   * in GATE 10 implies exactly this), and C6's per-account rate caps only
   * mean something once a slot names WHICH account. `platform` above
   * stays (a real, useful denormalization for filtering by platform
   * without a join) but every real cap/spacing check is keyed on this.
   */
  socialAccountId: uuid("social_account_id").references(() => socialAccounts.id),
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

/**
 * The publish pipeline's idempotency ledger (STEP 12) — the same
 * claim-before-side-effect pattern as `render_steps` (STEP 8.4), applied
 * to the ONE step in the publish workflow that creates real state on a
 * vendor's side (platform_init: a TikTok upload session, an Instagram
 * media container, a YouTube resumable session). `externalJobId` is
 * persisted the moment the vendor call returns, before polling begins —
 * a worker killed mid-poll and retried resumes polling this SAME id
 * instead of re-initing (which would create a duplicate draft/container
 * on the platform). This is GATE 12's chaos-test claim, made mechanical.
 */
export const publicationSteps = pgTable(
  "publication_steps",
  {
    id: idColumn(),
    workspaceId: workspaceIdColumn().references(() => workspaces.id),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id),
    stepKey: text("step_key").notNull(),
    stepKind: text("step_kind").notNull(),
    state: renderStepStateEnum("state").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    externalJobId: text("external_job_id"),
    uploadTarget: text("upload_target"),
    output: jsonb("output"),
    error: text("error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("publication_steps_publication_step_key_idx").on(table.publicationId, table.stepKey)],
);
