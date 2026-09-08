// @vitest-environment node
import { randomUUID } from "node:crypto";
import { notifications } from "@velocity/core";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertWorkspaceCanGenerate, getCreditBalance, reconcileAllWorkspaces, reconcileWorkspaceLedger } from "../credit-gate-service";

/**
 * GATE 19: "a workspace at its cap cannot generate" and "ledger
 * reconciles to provider costs", proven end to end against real PGlite —
 * real seeded credit_ledger/usage_events/subscriptions rows, not mocks.
 */
describe("credit-gate-service (STEP 19)", () => {
  let testDb: PgliteTestDb;
  let organisationId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    organisationId = randomUUID();
    workspaceId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Demo Workspace", workspaceType: "business" });
  });

  afterEach(() => {
    notifications.resetForTests();
  });

  describe("getCreditBalance", () => {
    it("reads the real credit_balances materialized view (sums credit minus debit)", async () => {
      await testDb.admin.insert(schema.creditLedger).values([
        { id: randomUUID(), workspaceId, debit: 0, credit: 1000, reason: "plan_grant" },
        { id: randomUUID(), workspaceId, debit: 200, credit: 0, reason: "video_generate" },
      ]);
      expect(await getCreditBalance(workspaceId, testDb.admin)).toBe(800);
    });

    it("returns 0 for a workspace with no ledger activity at all (no row in the view)", async () => {
      expect(await getCreditBalance(workspaceId, testDb.admin)).toBe(0);
    });
  });

  describe("assertWorkspaceCanGenerate — GATE 19's literal claim", () => {
    it("throws when the workspace has insufficient credit balance (no subscription, free plan)", async () => {
      await testDb.admin.insert(schema.creditLedger).values({ id: randomUUID(), workspaceId, debit: 0, credit: 10, reason: "plan_grant" });
      await expect(assertWorkspaceCanGenerate(workspaceId, 200, testDb.admin)).rejects.toThrow(/Insufficient credits/);
    });

    it("publishes a real credit_low notification (STEP 7's own bus reserved this event type for STEP 19) when refusing", async () => {
      const userId = randomUUID();
      const roleId = randomUUID();
      await testDb.admin.insert(schema.users).values({ id: userId, email: "member@example.com" });
      await testDb.admin.insert(schema.roles).values({ id: roleId, workspaceId: null, scope: "workspace", key: "owner", name: "Owner", permissions: [] });
      await testDb.admin.insert(schema.memberships).values({ id: randomUUID(), workspaceId, userId, roleId });
      await testDb.admin.insert(schema.creditLedger).values({ id: randomUUID(), workspaceId, debit: 0, credit: 10, reason: "plan_grant" });

      const handler = vi.fn();
      notifications.subscribe("credit_low", handler);

      await expect(assertWorkspaceCanGenerate(workspaceId, 200, testDb.admin)).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0)); // let the fire-and-forget publish's async handler settle

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "credit_low", workspaceId, userId }));
    });

    it("allows generation with a sufficient balance", async () => {
      await testDb.admin.insert(schema.creditLedger).values({ id: randomUUID(), workspaceId, debit: 0, credit: 1000, reason: "plan_grant" });
      await expect(assertWorkspaceCanGenerate(workspaceId, 200, testDb.admin)).resolves.toBeUndefined();
    });

    it("throws for a canceled subscription even with a healthy balance", async () => {
      await testDb.admin.insert(schema.creditLedger).values({ id: randomUUID(), workspaceId, debit: 0, credit: 5000, reason: "plan_grant" });
      await testDb.admin.insert(schema.subscriptions).values({ id: randomUUID(), workspaceId, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", planKey: "starter", status: "canceled" });
      await expect(assertWorkspaceCanGenerate(workspaceId, 50, testDb.admin)).rejects.toThrow(/canceled/);
    });

    it("allows generation for a past_due subscription within its grace period, given a sufficient balance", async () => {
      await testDb.admin.insert(schema.creditLedger).values({ id: randomUUID(), workspaceId, debit: 0, credit: 5000, reason: "plan_grant" });
      await testDb.admin.insert(schema.subscriptions).values({ id: randomUUID(), workspaceId, stripeCustomerId: "cus_2", stripeSubscriptionId: "sub_2", planKey: "starter", status: "past_due" });
      await expect(assertWorkspaceCanGenerate(workspaceId, 50, testDb.admin)).resolves.toBeUndefined();
    });
  });

  describe("reconcileWorkspaceLedger / reconcileAllWorkspaces — GATE 19: ledger reconciles to provider costs", () => {
    it("reports zero drift when every usage_event's real debit matches the current pricing model", async () => {
      const since = new Date("2020-01-01T00:00:00Z");
      const usageEventId = randomUUID();
      await testDb.admin.insert(schema.usageEvents).values({ id: usageEventId, workspaceId, provider: "kling", model: "kling-3.0", units: "20", costUsd: "0.6", jobKind: "video" });
      await testDb.admin.insert(schema.creditLedger).values({ id: randomUUID(), workspaceId, debit: 200, credit: 0, reason: "video_generate", referenceId: usageEventId });

      const result = await reconcileWorkspaceLedger(workspaceId, since, testDb.admin);
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.driftPercent).toBe(0);
      expect(result.mismatches).toEqual([]);
    });

    it("flags a real metering bug: a usage_event with no corresponding ledger debit", async () => {
      const since = new Date("2020-01-01T00:00:00Z");
      const usageEventId = randomUUID();
      await testDb.admin.insert(schema.usageEvents).values({ id: usageEventId, workspaceId, provider: "seedream", model: "seedream-5.0", units: "1", costUsd: "0.05", jobKind: "image" });
      // Deliberately no matching credit_ledger row.

      const result = await reconcileWorkspaceLedger(workspaceId, since, testDb.admin);
      expect(result.mismatches).toEqual([{ usageEventId, expectedCredits: 4, actualCredits: 0 }]);
      expect(result.driftExceedsThreshold).toBe(true);
    });

    it("publishes a real automation_alert notification when drift exceeds the 1% threshold", async () => {
      const userId = randomUUID();
      const roleId = randomUUID();
      await testDb.admin.insert(schema.users).values({ id: userId, email: "member2@example.com" });
      await testDb.admin.insert(schema.roles).values({ id: roleId, workspaceId: null, scope: "workspace", key: "owner", name: "Owner", permissions: [] });
      await testDb.admin.insert(schema.memberships).values({ id: randomUUID(), workspaceId, userId, roleId });

      const usageEventId = randomUUID();
      await testDb.admin.insert(schema.usageEvents).values({ id: usageEventId, workspaceId, provider: "seedream", model: "seedream-5.0", units: "1", costUsd: "0.05", jobKind: "image" });

      const handler = vi.fn();
      notifications.subscribe("automation_alert", handler);

      await reconcileWorkspaceLedger(workspaceId, new Date("2020-01-01T00:00:00Z"), testDb.admin);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "automation_alert", workspaceId, userId }));
    });

    it("only reconciles usage_events at or after `since`", async () => {
      const usageEventId = randomUUID();
      await testDb.admin.insert(schema.usageEvents).values({ id: usageEventId, workspaceId, provider: "seedream", model: "seedream-5.0", units: "1", costUsd: "0.05", jobKind: "image" });
      // No ledger row -- would be a mismatch if included, but `since` excludes it.
      const farFuture = new Date("2099-01-01T00:00:00Z");
      const result = await reconcileWorkspaceLedger(workspaceId, farFuture, testDb.admin);
      expect(result.mismatches).toEqual([]);
      expect(result.totalExpectedCredits).toBe(0);
    });

    it("reconcileAllWorkspaces covers every workspace with usage activity since the given time", async () => {
      const otherWorkspaceId = randomUUID();
      await testDb.admin.insert(schema.workspaces).values({ id: otherWorkspaceId, organisationId, name: "Other Workspace", workspaceType: "business" });

      const since = new Date("2020-01-01T00:00:00Z");
      const e1 = randomUUID();
      const e2 = randomUUID();
      await testDb.admin.insert(schema.usageEvents).values([
        { id: e1, workspaceId, provider: "seedream", model: "seedream-5.0", units: "1", costUsd: "0.05", jobKind: "image" },
        { id: e2, workspaceId: otherWorkspaceId, provider: "elevenlabs", model: "eleven-v3", units: "1", costUsd: "0.02", jobKind: "tts" },
      ]);
      await testDb.admin.insert(schema.creditLedger).values([
        { id: randomUUID(), workspaceId, debit: 4, credit: 0, reason: "image_generate", referenceId: e1 },
        { id: randomUUID(), workspaceId: otherWorkspaceId, debit: 2, credit: 0, reason: "tts_generate", referenceId: e2 },
      ]);

      const results = await reconcileAllWorkspaces(since, testDb.admin);
      const byWorkspace = new Map(results.map((r) => [r.workspaceId, r]));
      expect(byWorkspace.get(workspaceId)?.driftExceedsThreshold).toBe(false);
      expect(byWorkspace.get(otherWorkspaceId)?.driftExceedsThreshold).toBe(false);
    });
  });
});
