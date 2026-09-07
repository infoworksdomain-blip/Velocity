import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * `platform_quota_state` check-and-increment (STEP 11, GATE 11: "Quota
 * counters correct under concurrent publishes"). Typed against the same
 * shared `PgDatabase<any, typeof schema>` base apps/worker's step-ledger.ts
 * uses, not @velocity/db's concrete Database type — so this exact code
 * runs against a real embedded Postgres (PGlite) in tests and a real
 * network Postgres in production, no test-only branching.
 *
 * Real atomicity, not read-then-write: a single `INSERT ... ON CONFLICT
 * (social_account_id) DO UPDATE ... WHERE ... RETURNING` statement.
 * Postgres's own row-level locking on the unique constraint during this
 * ONE statement is what prevents two "concurrent" callers from both
 * reading count=N and both writing N+1 — the classic race a read-then-
 * check-in-JS-then-write design would NOT actually be safe against, even
 * against a real database. See schema/social.ts's own comment on why the
 * unique index on `social_account_id` (added alongside this) is what
 * makes the ON CONFLICT target well-defined in the first place.
 */
export type QuotaDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface QuotaCheckResult {
  allowed: boolean;
  requestCount: number;
  requestCap: number;
  windowStartsAt: Date;
}

export interface CheckAndIncrementQuotaInput {
  workspaceId: string;
  socialAccountId: string;
  /** 'publish' | 'metrics_read' — see schema/social.ts's own comment on why these are separate quota buckets, never conflated. */
  requestKind: string;
  windowSeconds: number;
  requestCap: number;
  now?: Date;
}

export async function checkAndIncrementQuota(db: QuotaDb, input: CheckAndIncrementQuotaInput): Promise<QuotaCheckResult> {
  const now = input.now ?? new Date();
  const newId = randomUUID();

  const result = await db.execute<{
    request_count: number;
    request_cap: number;
    window_starts_at: Date;
  }>(sql`
    INSERT INTO ${schema.platformQuotaState}
      (id, workspace_id, social_account_id, request_kind, window_starts_at, window_seconds, request_count, request_cap)
    VALUES
      (${newId}, ${input.workspaceId}, ${input.socialAccountId}, ${input.requestKind}, ${now}, ${input.windowSeconds}, 1, ${input.requestCap})
    ON CONFLICT (social_account_id, request_kind) DO UPDATE SET
      request_count = CASE
        WHEN ${schema.platformQuotaState.windowStartsAt} + (${schema.platformQuotaState.windowSeconds} || ' seconds')::interval <= ${now}
        THEN 1
        ELSE ${schema.platformQuotaState.requestCount} + 1
      END,
      window_starts_at = CASE
        WHEN ${schema.platformQuotaState.windowStartsAt} + (${schema.platformQuotaState.windowSeconds} || ' seconds')::interval <= ${now}
        THEN ${now}
        ELSE ${schema.platformQuotaState.windowStartsAt}
      END,
      window_seconds = CASE
        WHEN ${schema.platformQuotaState.windowStartsAt} + (${schema.platformQuotaState.windowSeconds} || ' seconds')::interval <= ${now}
        THEN ${input.windowSeconds}
        ELSE ${schema.platformQuotaState.windowSeconds}
      END,
      request_cap = ${input.requestCap},
      updated_at = ${now}
    WHERE
      ${schema.platformQuotaState.windowStartsAt} + (${schema.platformQuotaState.windowSeconds} || ' seconds')::interval <= ${now}
      OR ${schema.platformQuotaState.requestCount} < ${schema.platformQuotaState.requestCap}
    RETURNING request_count, request_cap, window_starts_at
  `);

  const rows = (result as unknown as { rows: { request_count: number; request_cap: number; window_starts_at: Date | string }[] }).rows;
  const row = rows[0];

  if (row) {
    return { allowed: true, requestCount: row.request_count, requestCap: row.request_cap, windowStartsAt: new Date(row.window_starts_at) };
  }

  // The WHERE clause rejected the conflicting row (still-open window, already at cap) — no row was touched, so RETURNING is empty. Fetch the current state to report it honestly.
  const existingRows = await db
    .select()
    .from(schema.platformQuotaState)
    .where(and(eq(schema.platformQuotaState.socialAccountId, input.socialAccountId), eq(schema.platformQuotaState.requestKind, input.requestKind)))
    .limit(1);
  const existing = existingRows[0]!;
  return { allowed: false, requestCount: existing.requestCount, requestCap: existing.requestCap, windowStartsAt: existing.windowStartsAt };
}
