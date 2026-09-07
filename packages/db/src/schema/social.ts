import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, workspaceIdColumn } from "./_helpers";
import { connectionStatusEnum, platformEnum } from "./enums";
import { workspaces } from "./tenancy";

export const socialAccounts = pgTable("social_accounts", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  platform: platformEnum("platform").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  handle: text("handle"),
  isPrivate: boolean("is_private"), // TikTok unaudited-client accounts must be private — tracked, not enforced here
  connectionStatus: connectionStatusEnum("connection_status").notNull().default("connected"),
  lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
  ...timestamps(),
}, (table) => [
  uniqueIndex("social_accounts_platform_external_id_idx").on(table.platform, table.externalAccountId),
]);

/**
 * The only place an OAuth token exists. `encryptedPayload` is the
 * KMS-envelope-encrypted blob (see packages/db/src/kms.ts); this column
 * must never be selected outside the token-refresh path and must never be
 * logged or returned by any API (threat model, item 2).
 */
export const platformCredentials = pgTable("platform_credentials", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  socialAccountId: uuid("social_account_id")
    .notNull()
    .references(() => socialAccounts.id),
  encryptedPayload: text("encrypted_payload").notNull(),
  kmsKeyId: text("kms_key_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps(),
});

/**
 * One row per social account (STEP 11) — the unique index below is not
 * just an integrity nicety, it's what makes `checkAndIncrementQuota`'s
 * single-statement `INSERT ... ON CONFLICT` genuinely atomic under real
 * concurrency (GATE 11: "Quota counters correct under concurrent
 * publishes"). Without it, two concurrent first-ever requests for the
 * same account could both take the INSERT path and create two rows,
 * defeating the whole point of a single counter.
 */
export const platformQuotaState = pgTable(
  "platform_quota_state",
  {
    id: idColumn(),
    workspaceId: workspaceIdColumn().references(() => workspaces.id),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id),
    windowStartsAt: timestamp("window_starts_at", { withTimezone: true }).notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    requestCap: integer("request_cap").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("platform_quota_state_social_account_id_idx").on(table.socialAccountId)],
);
