// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eraseUserData, exportUserData } from "../compliance-service";

/**
 * STEP 20's real GDPR/UK-GDPR DSAR export + erasure mechanism, proven
 * against real seeded data (real PGlite, not mocks).
 */
describe("compliance-service (STEP 20)", () => {
  let testDb: PgliteTestDb;
  let organisationId: string;
  let workspaceId: string;
  let userId: string;
  let roleId: string;
  let adminUserId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    organisationId = randomUUID();
    workspaceId = randomUUID();
    userId = randomUUID();
    roleId = randomUUID();
    adminUserId = randomUUID();

    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Demo Workspace", workspaceType: "business" });
    await testDb.admin.insert(schema.roles).values({ id: roleId, workspaceId: null, scope: "workspace", key: "owner", name: "Owner", permissions: [] });
    await testDb.admin.insert(schema.users).values([
      { id: userId, email: "subject@example.com", name: "Data Subject" },
      { id: adminUserId, email: "admin@platform.com", name: "Admin" },
    ]);
    await testDb.admin.insert(schema.memberships).values({ id: randomUUID(), workspaceId, userId, roleId });
    await testDb.admin.insert(schema.sessions).values({ id: randomUUID(), userId, refreshTokenHash: "hash1", expiresAt: new Date(Date.now() + 86400000) });
    await testDb.admin.insert(schema.mfaCredentials).values({ id: randomUUID(), userId, secretEncrypted: "enc", kmsKeyId: "key1", enabledAt: new Date() });
    await testDb.admin.insert(schema.auditLogs).values({ id: randomUUID(), workspaceId, actorUserId: userId, action: "content.create", targetType: "content_item", targetId: randomUUID() });
    await testDb.admin.insert(schema.impersonationSessions).values({ id: randomUUID(), actorUserId: adminUserId, targetUserId: userId, reason: "support ticket #123" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  describe("exportUserData — the DSAR export", () => {
    it("returns the real user row plus every real linked identity record", async () => {
      const result = await exportUserData(userId, testDb.admin);

      expect(result.user?.email).toBe("subject@example.com");
      expect(result.sessions).toHaveLength(1);
      expect(result.mfaCredentials).toHaveLength(1);
      expect(result.memberships).toHaveLength(1);
      expect(result.memberships[0]?.workspaceId).toBe(workspaceId);
      expect(result.auditLogsAsActor).toHaveLength(1);
      expect(result.impersonationSessions).toHaveLength(1);
      expect(result.impersonationSessions[0]?.targetUserId).toBe(userId);
    });

    it("never includes the encrypted MFA secret or its KMS key id — only non-secret metadata", async () => {
      const result = await exportUserData(userId, testDb.admin);
      const mfaRow = result.mfaCredentials[0] as unknown as Record<string, unknown>;
      expect(mfaRow.secretEncrypted).toBeUndefined();
      expect(mfaRow.kmsKeyId).toBeUndefined();
    });

    it("returns null for the user and empty arrays for a userId with no data at all", async () => {
      const result = await exportUserData(randomUUID(), testDb.admin);
      expect(result.user).toBeNull();
      expect(result.sessions).toEqual([]);
    });
  });

  describe("eraseUserData — real erasure", () => {
    it("anonymizes the users row, hard-deletes sessions/MFA, but retains audit_logs/impersonation_sessions for legal-obligation retention", async () => {
      await eraseUserData({ targetUserId: userId, actorUserId: adminUserId }, testDb.admin);

      const [userRow] = await testDb.admin.select().from(schema.users).where(eq(schema.users.id, userId));
      expect(userRow?.email).toBe(`deleted-${userId}@erased.invalid`);
      expect(userRow?.name).toBeNull();
      expect(userRow?.passwordHash).toBeNull();

      const sessionRows = await testDb.admin.select().from(schema.sessions).where(eq(schema.sessions.userId, userId));
      expect(sessionRows).toHaveLength(0);

      const mfaRows = await testDb.admin.select().from(schema.mfaCredentials).where(eq(schema.mfaCredentials.userId, userId));
      expect(mfaRows).toHaveLength(0);

      // Retained for GDPR Art. 17(3) legal-obligation reasons — the row still exists, but no longer resolves to any real PII once `users` itself is anonymized.
      const auditRows = await testDb.admin.select().from(schema.auditLogs).where(eq(schema.auditLogs.actorUserId, userId));
      expect(auditRows).toHaveLength(1);
      const impersonationRows = await testDb.admin.select().from(schema.impersonationSessions).where(eq(schema.impersonationSessions.targetUserId, userId));
      expect(impersonationRows).toHaveLength(1);
    });

    it("writes a real, permanent audit_logs entry recording the erasure itself", async () => {
      const targetUserId = randomUUID();
      await testDb.admin.insert(schema.users).values({ id: targetUserId, email: "another-subject@example.com" });

      await eraseUserData({ targetUserId, actorUserId: adminUserId }, testDb.admin);

      const logs = await testDb.admin.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "gdpr.erasure_completed"), eq(schema.auditLogs.targetId, targetUserId)));
      expect(logs).toHaveLength(1);
      expect(logs[0]?.actorUserId).toBe(adminUserId);
    });
  });
});
