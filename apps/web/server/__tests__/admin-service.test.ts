// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveWorkspaceAsAdmin,
  checkAndRecordSignupRisk,
  checkSystemHealth,
  evaluateFeatureFlag,
  getAiRouterSettings,
  isPlatformPaused,
  listAuditLogs,
  listPendingModerationReviews,
  listRiskSignals,
  listWorkspaces,
  recordRiskSignal,
  resolveModerationReviewAsAdmin,
  searchUsers,
  setPlatformPause,
  suspendUser,
  unarchiveWorkspaceAsAdmin,
  unsuspendUser,
  updateAiRouterSettings,
  upsertAiProviderConfig,
  upsertFeatureFlag,
} from "../admin-service";

/**
 * STEP 18's admin surface, proven against real PGlite (which already
 * replays migration 0022 — the same real seed data
 * db-provider-config-source.test.ts in apps/worker proves matches
 * config/providers.json). Focused on GATE 18's three literal claims:
 * every destructive action is audit-logged with before/after, feature
 * flags evaluate per workspace AND per user, and the DB rows a kill
 * switch flips are the same ones apps/worker's DbProviderConfigSource
 * reads.
 */
describe("Admin service (STEP 18)", () => {
  let testDb: PgliteTestDb;
  let organisationId: string;
  let workspaceId: string;
  let adminUserId: string;
  let targetUserId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    organisationId = randomUUID();
    workspaceId = randomUUID();
    adminUserId = randomUUID();
    targetUserId = randomUUID();

    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Demo Workspace", workspaceType: "business" });
    await testDb.admin.insert(schema.users).values([
      { id: adminUserId, email: "super@platform.com", name: "Super Admin" },
      { id: targetUserId, email: "target@example.com", name: "Target User" },
    ]);
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  describe("user suspension", () => {
    it("suspends a user and writes a real audit_logs entry with before/after", async () => {
      await suspendUser({ targetUserId, reason: "ToS violation", actorUserId: adminUserId }, testDb.admin);

      const [user] = await testDb.admin.select({ suspendedAt: schema.users.suspendedAt, suspendedReason: schema.users.suspendedReason }).from(schema.users).where(eq(schema.users.id, targetUserId));
      expect(user?.suspendedAt).not.toBeNull();
      expect(user?.suspendedReason).toBe("ToS violation");

      const logs = await testDb.admin.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "user.suspend"), eq(schema.auditLogs.targetId, targetUserId)));
      expect(logs).toHaveLength(1);
      expect(logs[0]?.actorUserId).toBe(adminUserId);
      expect(logs[0]?.before).toEqual({ suspendedAt: null, suspendedReason: null });
      expect((logs[0]?.after as { suspendedReason: string }).suspendedReason).toBe("ToS violation");
    });

    it("a suspended user is found by search, with suspension state visible", async () => {
      const results = await searchUsers("target@example.com", testDb.admin);
      expect(results).toHaveLength(1);
      expect(results[0]?.suspendedAt).not.toBeNull();
    });

    it("unsuspends a user and writes a real audit_logs entry", async () => {
      await unsuspendUser({ targetUserId, actorUserId: adminUserId }, testDb.admin);
      const [user] = await testDb.admin.select({ suspendedAt: schema.users.suspendedAt }).from(schema.users).where(eq(schema.users.id, targetUserId));
      expect(user?.suspendedAt).toBeNull();

      const logs = await testDb.admin.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "user.unsuspend"), eq(schema.auditLogs.targetId, targetUserId)));
      expect(logs).toHaveLength(1);
    });
  });

  describe("workspace archive", () => {
    it("archives and unarchives a workspace, both audit-logged", async () => {
      await archiveWorkspaceAsAdmin({ workspaceId, actorUserId: adminUserId }, testDb.admin);
      let [ws] = await testDb.admin.select({ deletedAt: schema.workspaces.deletedAt }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
      expect(ws?.deletedAt).not.toBeNull();

      await unarchiveWorkspaceAsAdmin({ workspaceId, actorUserId: adminUserId }, testDb.admin);
      [ws] = await testDb.admin.select({ deletedAt: schema.workspaces.deletedAt }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
      expect(ws?.deletedAt).toBeNull();

      const logs = await testDb.admin.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetId, workspaceId));
      expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["workspace.archive", "workspace.unarchive"]));
    });

    it("lists workspaces platform-wide", async () => {
      const results = await listWorkspaces(testDb.admin);
      expect(results.some((w) => w.id === workspaceId)).toBe(true);
    });
  });

  describe("AI model management (the same rows apps/worker's DbProviderConfigSource reads)", () => {
    it("upserts a provider config row and audit-logs the change", async () => {
      await upsertAiProviderConfig(
        { kind: "video", providerId: "kling-3.0", enabled: false, weight: 0, tiers: ["pro"], adapter: "stub", breakerFailureThreshold: 5, breakerWindowSec: 60, breakerCooldownSec: 120, actorUserId: adminUserId },
        testDb.admin,
      );
      const [row] = await testDb.admin.select().from(schema.aiProviderConfigs).where(and(eq(schema.aiProviderConfigs.kind, "video"), eq(schema.aiProviderConfigs.providerId, "kling-3.0")));
      expect(row?.enabled).toBe(false);
      expect(row?.weight).toBe(0);

      const logs = await testDb.admin.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetId, "video:kling-3.0"));
      expect(logs.length).toBeGreaterThan(0);
    });

    it("updates the ai_router_settings singleton row", async () => {
      const before = await getAiRouterSettings(testDb.admin);
      expect(before).not.toBeNull();

      await updateAiRouterSettings(
        { fallbackChainMaxLength: 5, costCeilingVideoUsd: 1.5, costCeilingImageUsd: 0.1, costCeilingTtsUsd: 0.03, costCeilingTranscriptionUsd: 0.02, costCeilingTextUsd: 0.05, actorUserId: adminUserId },
        testDb.admin,
      );

      const after = await getAiRouterSettings(testDb.admin);
      expect(after?.fallbackChainMaxLength).toBe(5);
      expect(after?.costCeilingVideoUsd).toBe("1.5000");
    });
  });

  describe("feature flags evaluate per workspace AND per user (GATE 18)", () => {
    const key = "new_dashboard";
    let flagUserId: string;

    beforeAll(async () => {
      flagUserId = randomUUID();
      await testDb.admin.insert(schema.users).values({ id: flagUserId, email: "flag-user@example.com" });
    });

    it("a workspace-scoped upsert overrides the platform default for that workspace only", async () => {
      await upsertFeatureFlag({ key, workspaceId: null, userId: null, isEnabled: true, actorUserId: adminUserId }, testDb.admin);
      await upsertFeatureFlag({ key, workspaceId, userId: null, isEnabled: false, actorUserId: adminUserId }, testDb.admin);

      expect(await evaluateFeatureFlag({ key, workspaceId }, testDb.admin)).toBe(false);
      expect(await evaluateFeatureFlag({ key }, testDb.admin)).toBe(true);
    });

    it("a user-scoped upsert overrides the workspace default for that user only", async () => {
      await upsertFeatureFlag({ key, workspaceId: null, userId: flagUserId, isEnabled: true, actorUserId: adminUserId }, testDb.admin);

      expect(await evaluateFeatureFlag({ key, workspaceId, userId: flagUserId }, testDb.admin)).toBe(true);
      expect(await evaluateFeatureFlag({ key, workspaceId, userId: adminUserId }, testDb.admin)).toBe(false);
    });

    it("re-upserting the same scope updates the row rather than duplicating it", async () => {
      await upsertFeatureFlag({ key, workspaceId, userId: null, isEnabled: true, actorUserId: adminUserId }, testDb.admin);
      const rows = await testDb.admin.select().from(schema.featureFlags).where(and(eq(schema.featureFlags.key, key), eq(schema.featureFlags.workspaceId, workspaceId)));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.isEnabled).toBe(true);
    });
  });

  describe("platform pause (global kill switch, reusing feature flags)", () => {
    it("starts unpaused, and pausing/unpausing tiktok is audit-logged and takes effect immediately", async () => {
      expect(await isPlatformPaused("tiktok", testDb.admin)).toBe(false);

      await setPlatformPause("tiktok", true, adminUserId, testDb.admin);
      expect(await isPlatformPaused("tiktok", testDb.admin)).toBe(true);
      // A different platform's pause is independent.
      expect(await isPlatformPaused("instagram", testDb.admin)).toBe(false);

      await setPlatformPause("tiktok", false, adminUserId, testDb.admin);
      expect(await isPlatformPaused("tiktok", testDb.admin)).toBe(false);

      const logs = await testDb.admin.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetId, "platform_pause:tiktok"));
      expect(logs.length).toBe(2);
    });
  });

  describe("content moderation queue (closes STEP 15's flagged gap)", () => {
    it("lists a pending review and resolving it is audit-logged", async () => {
      const reviewId = randomUUID();
      await testDb.admin.insert(schema.moderationReviews).values({ id: reviewId, workspaceId, targetType: "persona", targetId: randomUUID(), status: "pending", policyVersion: "v1" });

      const pending = await listPendingModerationReviews(testDb.admin);
      expect(pending.some((r) => r.id === reviewId)).toBe(true);

      await resolveModerationReviewAsAdmin({ workspaceId, reviewId, decision: "approved", actorUserId: adminUserId }, testDb.admin);

      const [row] = await testDb.admin.select({ status: schema.moderationReviews.status }).from(schema.moderationReviews).where(eq(schema.moderationReviews.id, reviewId));
      expect(row?.status).toBe("approved");

      const logs = await testDb.admin.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "moderation_review.resolve"), eq(schema.auditLogs.targetId, reviewId)));
      expect(logs).toHaveLength(1);

      const stillPending = await listPendingModerationReviews(testDb.admin);
      expect(stillPending.some((r) => r.id === reviewId)).toBe(false);
    });
  });

  describe("fraud/risk signals", () => {
    it("records and lists a risk signal", async () => {
      await recordRiskSignal({ workspaceId, signalType: "multi_account", severity: "medium", details: { normalizedIdentity: "a@gmail.com" } }, testDb.admin);
      const signals = await listRiskSignals(testDb.admin);
      expect(signals.some((s) => s.workspaceId === workspaceId && s.signalType === "multi_account")).toBe(true);
    });
  });

  describe("audit log viewer", () => {
    it("filters by action", async () => {
      const logs = await listAuditLogs({ action: "user.suspend" }, testDb.admin);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((l) => l.action === "user.suspend")).toBe(true);
    });
  });

  describe("system health", () => {
    it("reports a real DB-connectivity check", async () => {
      const health = await checkSystemHealth(testDb.admin);
      expect(health.databaseReachable).toBe(true);
    });
  });

  describe("signup-time disposable-email detection (non-blocking)", () => {
    it("detects a real seed-listed disposable domain and audit-logs it, without throwing", async () => {
      const signupUserId = randomUUID();
      await testDb.admin.insert(schema.users).values({ id: signupUserId, email: "throwaway@mailinator.com" });

      const flagged = await checkAndRecordSignupRisk(signupUserId, "throwaway@mailinator.com", testDb.admin);
      expect(flagged).toBe(true);

      const logs = await testDb.admin.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "signup.disposable_email_detected"), eq(schema.auditLogs.targetId, signupUserId)));
      expect(logs).toHaveLength(1);
      expect(logs[0]?.workspaceId).toBeNull();
    });

    it("does not flag an ordinary email domain", async () => {
      const signupUserId = randomUUID();
      await testDb.admin.insert(schema.users).values({ id: signupUserId, email: "real-person@example.com" });
      const flagged = await checkAndRecordSignupRisk(signupUserId, "real-person@example.com", testDb.admin);
      expect(flagged).toBe(false);
    });
  });
});
