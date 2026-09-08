import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkAndIncrementRateLimit, peekRateLimit } from "../rate-limit.js";

describe("checkAndIncrementRateLimit — against a real embedded Postgres (PGlite)", () => {
  let testDb: PgliteTestDb;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  it("allows requests up to the cap, and rejects the one that would exceed it", async () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const bucketKey = "signup:email_domain:test-a.example.com";

    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkAndIncrementRateLimit(testDb.admin, { bucketKey, windowSeconds: 3600, requestCap: 3, now }));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]!.requestCount).toBe(4); // request_count keeps incrementing (a real, visible signal of how far over the cap a caller went), only `allowed` flips
  });

  it("opens a fresh window once the previous one has expired, even though the bucket was previously at cap", async () => {
    const bucketKey = "api_key:key-123";
    const windowStart = new Date("2026-06-01T00:00:00Z");

    await checkAndIncrementRateLimit(testDb.admin, { bucketKey, windowSeconds: 3600, requestCap: 1, now: windowStart });
    const stillInWindow = await checkAndIncrementRateLimit(testDb.admin, { bucketKey, windowSeconds: 3600, requestCap: 1, now: new Date(windowStart.getTime() + 30 * 60000) });
    expect(stillInWindow.allowed).toBe(false);

    const afterWindow = await checkAndIncrementRateLimit(testDb.admin, { bucketKey, windowSeconds: 3600, requestCap: 1, now: new Date(windowStart.getTime() + 3601 * 1000) });
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.requestCount).toBe(1);
  });

  it("different bucket keys are entirely independent", async () => {
    const now = new Date("2026-06-01T12:00:00Z");
    await checkAndIncrementRateLimit(testDb.admin, { bucketKey: "generate:workspace-a", windowSeconds: 60, requestCap: 1, now });
    const other = await checkAndIncrementRateLimit(testDb.admin, { bucketKey: "generate:workspace-b", windowSeconds: 60, requestCap: 1, now });
    expect(other.allowed).toBe(true);
  });

  it("peekRateLimit reads current state without consuming a request slot", async () => {
    const bucketKey = "signup:email_domain:peek-test.example.com";
    const now = new Date("2026-06-01T12:00:00Z");
    await checkAndIncrementRateLimit(testDb.admin, { bucketKey, windowSeconds: 3600, requestCap: 5, now });

    const peeked1 = await peekRateLimit(testDb.admin, bucketKey);
    const peeked2 = await peekRateLimit(testDb.admin, bucketKey);
    expect(peeked1?.requestCount).toBe(1);
    expect(peeked2?.requestCount).toBe(1); // unchanged — peeking never increments
  });

  it("peekRateLimit returns null for a bucket that has never been hit", async () => {
    expect(await peekRateLimit(testDb.admin, "never-used-bucket")).toBeNull();
  });

  /**
   * GATE 20's abuse-prevention claim reduces to the same real concurrency
   * guarantee GATE 11 already proved for `checkAndIncrementQuota` —
   * genuine concurrent calls (Promise.all, not sequential awaits) against
   * the SAME bucket must never let more than the cap through.
   */
  it("never allows more than the cap through, even under genuine concurrent calls", async () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const CAP = 5;
    const CONCURRENT_CALLS = 20;
    const bucketKey = "generate:concurrency-test-workspace";

    const results = await Promise.all(Array.from({ length: CONCURRENT_CALLS }, () => checkAndIncrementRateLimit(testDb.admin, { bucketKey, windowSeconds: 86400, requestCap: CAP, now })));

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(CAP);
  });
});
