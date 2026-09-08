import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, workspaceIdColumn } from "./_helpers";
import { users, workspaces } from "./tenancy";

/**
 * Append-only. No `updatedAt`/`deletedAt` — a row is never modified after
 * insert. The DELETE grant is revoked from the application role at the
 * database level in migration 0001; this is not just an omitted code path.
 */
export const auditLogs = pgTable("audit_logs", {
  id: idColumn(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id), // nullable: platform-level actions (e.g. superadmin impersonation) have no workspace
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Platform-root by default (workspaceId AND userId null = global flag).
 * STEP 18 added `userId` (build script's own literal "feature flags
 * evaluate per workspace and per user") — resolution precedence is
 * user-override -> workspace-override -> platform-default, the same
 * "most specific tier wins" shape STEP 4's settings resolution already
 * established (`packages/core/src/settings/resolve.ts`), extended one
 * level further. See `packages/core/src/admin/feature-flags.ts`.
 */
export const featureFlags = pgTable("feature_flags", {
  id: idColumn(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  userId: uuid("user_id").references(() => users.id),
  key: text("key").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moderationReviews = pgTable("moderation_reviews", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  status: text("status").notNull(), // pending | approved | rejected | appealed
  policyVersion: text("policy_version").notNull(),
  reviewerUserId: uuid("reviewer_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const riskSignals = pgTable("risk_signals", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  signalType: text("signal_type").notNull(), // disposable_email | multi_account | payment_risk | velocity_abuse
  severity: text("severity").notNull(), // low | medium | high | critical
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
