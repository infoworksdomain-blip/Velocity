import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, workspaceIdColumn } from "./_helpers";
import { users, workspaces } from "./tenancy";

/**
 * The in-app notification center (STEP 7). One row per delivered
 * notification, per user — `readAt` is the only mutable column,
 * everything else is written once by the persistence subscriber in
 * apps/web/server/notifications-bootstrap.ts and never touched again.
 */
export const notifications = pgTable("notifications", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(), // e.g. render_complete, publish_failed, credit_low — see packages/core/src/notifications/bus.ts
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per (workspace, user); `preferences` is an event-type -> enabled
 * jsonb map, resolved with an app-level default (missing key = enabled)
 * rather than a DB default, mirroring how workspaces.settings/
 * organisations.settings are resolved in packages/core/src/settings.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: idColumn(),
    workspaceId: workspaceIdColumn().references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    preferences: jsonb("preferences").$type<Record<string, boolean>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("notification_preferences_workspace_user_idx").on(table.workspaceId, table.userId)],
);
