import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeAuditLog } from "../index";

describe("writeAuditLog — against a real embedded Postgres (PGlite)", () => {
  let testDb: PgliteTestDb;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    userId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "WS", workspaceType: "business" });
    await testDb.admin.insert(schema.users).values({ id: userId, email: "owner@example.com" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  it("writes a real, queryable audit log row", async () => {
    await writeAuditLog(testDb.admin, {
      workspaceId,
      actorUserId: userId,
      action: "assistant.tool_call",
      targetType: "assistant_tool",
      targetId: "pull_analytics",
      before: null,
      after: { groupBy: "platform" },
    });

    const rows = await testDb.admin.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetId, "pull_analytics"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.workspaceId).toBe(workspaceId);
    expect(rows[0]!.actorUserId).toBe(userId);
    expect(rows[0]!.action).toBe("assistant.tool_call");
    expect(rows[0]!.after).toEqual({ groupBy: "platform" });
  });

  it("allows a null workspaceId for a platform-level action", async () => {
    await writeAuditLog(testDb.admin, { workspaceId: null, actorUserId: userId, action: "platform.impersonate", targetType: "user", targetId: userId });
    const rows = await testDb.admin.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "platform.impersonate"));
    expect(rows[0]!.workspaceId).toBeNull();
  });
});
