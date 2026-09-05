import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, softDelete, timestamps } from "./_helpers";
import { invitationStatusEnum, roleScopeEnum, workspaceTypeEnum } from "./enums";

/**
 * Tenancy root. `organisations` and `users` are deliberately platform-root
 * (no workspace_id, no RLS) — a user belongs to N workspaces via
 * `memberships`, and RLS isolation starts at `workspaces` and everything
 * that hangs off it. See ADR 0003.
 */

export const organisations = pgTable("organisations", {
  id: idColumn(),
  name: text("name").notNull(),
  ...timestamps(),
});

export const workspaces = pgTable("workspaces", {
  id: idColumn(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  workspaceType: workspaceTypeEnum("workspace_type").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  ...timestamps(),
  ...softDelete(),
});

export const users = pgTable("users", {
  id: idColumn(),
  email: text("email").notNull(),
  name: text("name"),
  ...timestamps(),
}, (table) => [uniqueIndex("users_email_idx").on(table.email)]);

/**
 * Role definitions. `scope = 'platform'` rows have `workspaceId = null`
 * (superadmin/support/moderator/finance from STEP 3); `scope = 'workspace'`
 * rows are either the seeded baseline (owner/admin/editor/contributor/
 * viewer/client/agency_manager) or a custom role an agency defines in
 * STEP 17. `key` is a stable machine identifier; `permissions` is the
 * resource:action:scope list the STEP 3 policy module reads — this table
 * IS the "one central policy module" data source, not a cache of it.
 */
export const roles = pgTable("roles", {
  id: idColumn(),
  workspaceId: uuid("workspace_id"), // null for platform-scoped roles
  scope: roleScopeEnum("scope").notNull(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  ...timestamps(),
});

export const memberships = pgTable("memberships", {
  id: idColumn(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id),
  ...timestamps(),
}, (table) => [
  uniqueIndex("memberships_workspace_user_idx").on(table.workspaceId, table.userId),
]);

export const invitations = pgTable("invitations", {
  id: idColumn(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  email: text("email").notNull(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id),
  status: invitationStatusEnum("status").notNull().default("pending"),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps(),
});
