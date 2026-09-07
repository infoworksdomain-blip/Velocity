import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkAndIncrementQuota } from "../quota.js";

describe("checkAndIncrementQuota — against a real embedded Postgres (PGlite)", () => {
  let testDb: PgliteTestDb;
  let workspaceId: string;
  let socialAccountId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    socialAccountId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "WS", workspaceType: "business" });
    await testDb.admin.insert(schema.socialAccounts).values({ id: socialAccountId, workspaceId, platform: "tiktok", externalAccountId: "ext-1" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  it("allows requests up to the cap, and rejects the one that would exceed it", async () => {
    const account2 = randomUUID();
    await testDb.admin.insert(schema.socialAccounts).values({ id: account2, workspaceId, platform: "instagram", externalAccountId: "ext-2" });
    const now = new Date("2026-06-01T12:00:00Z");

    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId: account2, requestKind: "publish", windowSeconds: 86400, requestCap: 3, now }));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]!.requestCount).toBe(3); // the rejected attempt reports the actual (unincremented) state, not a phantom 4
  });

  it("opens a fresh window once the previous one has expired, even though the account was previously at cap", async () => {
    const account3 = randomUUID();
    await testDb.admin.insert(schema.socialAccounts).values({ id: account3, workspaceId, platform: "youtube", externalAccountId: "ext-3" });

    const windowStart = new Date("2026-06-01T00:00:00Z");
    await checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId: account3, requestKind: "publish", windowSeconds: 3600, requestCap: 1, now: windowStart });
    const stillInWindow = await checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId: account3, requestKind: "publish", windowSeconds: 3600, requestCap: 1, now: new Date(windowStart.getTime() + 30 * 60000) });
    expect(stillInWindow.allowed).toBe(false);

    const afterWindow = await checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId: account3, requestKind: "publish", windowSeconds: 3600, requestCap: 1, now: new Date(windowStart.getTime() + 3601 * 1000) });
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.requestCount).toBe(1);
  });

  /**
   * GATE 11's literal claim: "Quota counters correct under concurrent
   * publishes." Fires many real concurrent calls (genuine Promise.all,
   * not sequential awaits) against the SAME account and asserts the
   * total allowed count never exceeds the cap — the actual race this
   * module's single-statement atomic UPSERT (not read-then-write) exists
   * to prevent.
   */
  it("GATE 11: never allows more than the cap through, even under genuine concurrent calls", async () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const CAP = 5;
    const CONCURRENT_CALLS = 20;

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () => checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId, requestKind: "publish", windowSeconds: 86400, requestCap: CAP, now })),
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(CAP);

    // Read back the row directly — the persisted count must exactly match the cap, not have drifted above it from a lost update.
    const rows = await testDb.admin.select().from(schema.platformQuotaState).where(eq(schema.platformQuotaState.socialAccountId, socialAccountId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.requestCount).toBe(CAP);
  });

  /**
   * STEP 13: request_kind separates a publish-rate cap from a
   * metrics-read-rate cap on the SAME account — proves they're genuinely
   * independent counters, not one shared bucket a burst of analytics
   * polling could silently eat into.
   */
  it("tracks publish and metrics_read quota independently for the same account", async () => {
    const account4 = randomUUID();
    await testDb.admin.insert(schema.socialAccounts).values({ id: account4, workspaceId, platform: "tiktok", externalAccountId: "ext-4" });
    const now = new Date("2026-06-01T12:00:00Z");

    const publishResult = await checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId: account4, requestKind: "publish", windowSeconds: 86400, requestCap: 1, now });
    expect(publishResult.allowed).toBe(true);
    const publishExhausted = await checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId: account4, requestKind: "publish", windowSeconds: 86400, requestCap: 1, now });
    expect(publishExhausted.allowed).toBe(false);

    // metrics_read still has full headroom — publish's exhaustion above didn't touch it.
    const metricsResult = await checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId: account4, requestKind: "metrics_read", windowSeconds: 86400, requestCap: 5, now });
    expect(metricsResult.allowed).toBe(true);
    expect(metricsResult.requestCount).toBe(1);

    const rows = await testDb.admin.select().from(schema.platformQuotaState).where(eq(schema.platformQuotaState.socialAccountId, account4));
    expect(rows).toHaveLength(2);
  });
});
