import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * STEP 20's real, generic rate limiter (build script: "rate limiting and
 * abuse — signup velocity, generation abuse, API-key abuse"). Same
 * atomic `INSERT ... ON CONFLICT ... RETURNING` shape STEP 11's
 * `checkAndIncrementQuota` already proved race-free under 20 real
 * concurrent calls, generalised to one `bucket_key` per abuse surface
 * instead of `(social_account_id, request_kind)` — a single sliding
 * window per key, atomic in one statement (never read-then-write, which
 * is not actually safe against concurrent callers even against a real
 * database).
 */
export type RateLimitDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RateLimitCheckResult {
  allowed: boolean;
  requestCount: number;
  requestCap: number;
  windowStartsAt: Date;
}

export interface CheckAndIncrementRateLimitInput {
  bucketKey: string;
  windowSeconds: number;
  requestCap: number;
  now?: Date;
}

export async function checkAndIncrementRateLimit(db: RateLimitDb, input: CheckAndIncrementRateLimitInput): Promise<RateLimitCheckResult> {
  const now = input.now ?? new Date();
  const newId = randomUUID();

  const result = await db.execute<{
    request_count: number;
    request_cap: number;
    window_starts_at: Date;
  }>(sql`
    INSERT INTO ${schema.rateLimitBuckets}
      (id, bucket_key, window_starts_at, window_seconds, request_count, request_cap)
    VALUES
      (${newId}, ${input.bucketKey}, ${now}, ${input.windowSeconds}, 1, ${input.requestCap})
    ON CONFLICT (bucket_key) DO UPDATE SET
      request_count = CASE
        WHEN ${schema.rateLimitBuckets.windowStartsAt} + (${schema.rateLimitBuckets.windowSeconds} || ' seconds')::interval <= ${now}
        THEN 1
        ELSE ${schema.rateLimitBuckets.requestCount} + 1
      END,
      window_starts_at = CASE
        WHEN ${schema.rateLimitBuckets.windowStartsAt} + (${schema.rateLimitBuckets.windowSeconds} || ' seconds')::interval <= ${now}
        THEN ${now}
        ELSE ${schema.rateLimitBuckets.windowStartsAt}
      END,
      request_cap = ${input.requestCap},
      updated_at = ${now}
    RETURNING request_count, request_cap, window_starts_at
  `);

  const row = result.rows[0] as { request_count: number; request_cap: number; window_starts_at: Date } | undefined;
  if (!row) throw new Error("checkAndIncrementRateLimit: RETURNING produced no row — this should be impossible");

  return { allowed: row.request_count <= row.request_cap, requestCount: row.request_count, requestCap: row.request_cap, windowStartsAt: row.window_starts_at };
}

/** Read-only peek — used by an admin surface or a pre-check that shouldn't itself consume a request slot. */
export async function peekRateLimit(db: RateLimitDb, bucketKey: string): Promise<RateLimitCheckResult | null> {
  const rows = await db.select().from(schema.rateLimitBuckets).where(eq(schema.rateLimitBuckets.bucketKey, bucketKey)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { allowed: row.requestCount <= row.requestCap, requestCount: row.requestCount, requestCap: row.requestCap, windowStartsAt: row.windowStartsAt };
}
