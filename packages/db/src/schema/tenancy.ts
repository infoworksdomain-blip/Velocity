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
  /** Org-default settings — the middle tier of STEP 4's workspace-override -> org-default -> platform-default resolution order. See packages/core/src/settings. */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
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
  /** Workspace-level override — the innermost, highest-priority tier of the settings resolution order. */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps(),
  ...softDelete(),
});

export const users = pgTable("users", {
  id: idColumn(),
  email: text("email").notNull(),
  name: text("name"),
  /** Nullable — a user who only ever signs in via OAuth (STEP 3's Google adapter) has no password. Hashed with bcrypt, see packages/core/src/auth/password.ts. */
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  /**
   * Nullable FK to a scope='platform' row in `roles`. Platform roles
   * (superadmin/support/moderator/finance) aren't tied to any workspace,
   * so they can't be expressed through `memberships` (which requires a
   * workspace_id) — this column is the actual assignment mechanism.
   * Enforcing "must point at a scope='platform' role" is an application-
   * layer check (STEP 3's signup/admin procedures), not a DB constraint —
   * Postgres has no native cross-row CHECK against another table's column.
   */
  platformRoleId: uuid("platform_role_id").references(() => roles.id),
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
