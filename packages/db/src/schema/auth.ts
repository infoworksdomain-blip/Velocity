import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn } from "./_helpers";
import { users } from "./tenancy";

/**
 * Platform-root (no workspace_id) — a session or MFA credential belongs to
 * a user, not a workspace, so ADR 0003's RLS does not apply here, same as
 * `users`/`organisations`. Added in STEP 3; not part of STEP 2's table
 * list because the build script's own STEP 2 block doesn't mention them.
 */

export const sessions = pgTable("sessions", {
  id: idColumn(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** `secretEncrypted` is encrypted via the KmsProvider from packages/db/src/kms.ts — never stored in plaintext. */
export const mfaCredentials = pgTable("mfa_credentials", {
  id: idColumn(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  secretEncrypted: text("secret_encrypted").notNull(),
  kmsKeyId: text("kms_key_id").notNull(),
  enabledAt: timestamp("enabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mfaRecoveryCodes = pgTable("mfa_recovery_codes", {
  id: idColumn(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Lifecycle of a time-boxed support impersonation session. The permanent record GATE 3 checks for is the corresponding audit_logs row, written alongside this. */
export const impersonationSessions = pgTable("impersonation_sessions", {
  id: idColumn(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id),
  targetUserId: uuid("target_user_id")
    .notNull()
    .references(() => users.id),
  reason: text("reason").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});
