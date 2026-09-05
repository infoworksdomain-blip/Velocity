import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, workspaceIdColumn } from "./_helpers";
import { workspaces } from "./tenancy";

/** Stores a hash, never the raw key — same custody discipline as platform_credentials. */
export const apiKeys = pgTable("api_keys", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(), // shown in UI for identification, e.g. "vk_live_ab12"
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps(),
});

export const webhooks = pgTable("webhooks", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  url: text("url").notNull(),
  secret: text("secret").notNull(), // HMAC signing secret
  events: jsonb("events").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  webhookId: uuid("webhook_id")
    .notNull()
    .references(() => webhooks.id),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  responseStatus: integer("response_status"),
  attemptCount: integer("attempt_count").notNull().default(0),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  ...timestamps(),
});
