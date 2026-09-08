import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
  /** STEP 16 additions: real exponential-backoff retry state. Null nextRetryAt + null deliveredAt + attemptCount 0 means "not yet attempted, due now." A null nextRetryAt with attemptCount >= MAX_DELIVERY_ATTEMPTS means exhausted — the replay endpoint's job is to clear it back to "due now." */
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  lastError: text("last_error"),
  ...timestamps(),
});

/**
 * Generic Idempotency-Key support for the Public API (STEP 16, build
 * script: "idempotency keys on writes"). Unlike `publications.
 * idempotency_key` (STEP 12, scoped to one specific write path), this is
 * a real, reusable mechanism any /v1 POST/PATCH/DELETE handler can use:
 * an atomic `INSERT ... ON CONFLICT DO NOTHING` on (workspace_id, key)
 * claims the key before the handler's real work runs, and the cached
 * `responseBody`/`statusCode` are replayed verbatim on a retried request
 * with the same key — the same claim-before-side-effect discipline as
 * `render_steps`/`publication_steps`.
 */
export const apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    id: idColumn(),
    workspaceId: workspaceIdColumn().references(() => workspaces.id),
    idempotencyKey: text("idempotency_key").notNull(),
    statusCode: integer("status_code"),
    responseBody: jsonb("response_body"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("api_idempotency_keys_workspace_key_idx").on(table.workspaceId, table.idempotencyKey)],
);
