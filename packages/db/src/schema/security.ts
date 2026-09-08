import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers";

/**
 * STEP 20's real, generic rate limiter — the same atomic check-and-
 * increment shape STEP 11's `platform_quota_state` already proved race-
 * free under 20 real concurrent calls (`checkAndIncrementQuota`), applied
 * to a single generic `bucket_key` instead of a `(social_account_id,
 * request_kind)` pair, so this one table serves every abuse surface
 * (signup velocity, API-key abuse, generation-trigger abuse) rather than
 * a new quota table per surface. Platform-root: signup velocity limiting
 * in particular must work BEFORE any workspace exists (the same
 * constraint STEP 18's disposable-email check already ran into).
 */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: idColumn(),
    bucketKey: text("bucket_key").notNull(), // e.g. "signup:email_domain:example.com", "api_key:<id>", "generate:<workspaceId>"
    windowStartsAt: timestamp("window_starts_at", { withTimezone: true }).notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    requestCap: integer("request_cap").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("rate_limit_buckets_bucket_key_idx").on(table.bucketKey)],
);
