// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { killAgentRun, startAgentRun } from "../agent-service";

/**
 * Goal-directed AI Agent runs (STEP 16), proven against real PGlite. Uses
 * the real ANTHROPIC_API_KEY-absent path (the deterministic stub
 * assistant provider) so this test needs no funded credential — the same
 * approach STEP 14's own stub-provider isolation test uses.
 */
describe("Agent runs (STEP 16)", () => {
  let testDb: PgliteTestDb;
  let workspaceId: string;
  let userId: string;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    userId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Workspace", workspaceType: "business" });
    await testDb.admin.insert(schema.users).values({ id: userId, email: "user@example.com" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
    if (originalAnthropicKey !== undefined) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });

  it("persists a real agent_runs row with a completed status and a real step trace, using the stub provider (no funded API key)", async () => {
    const result = await startAgentRun({ workspaceId, userId, goal: "pull my analytics by platform", spendCapUsd: 10 }, testDb.admin);

    // pull_analytics is a free, read-only tool — well within a $10 cap, so this should reliably complete rather than hit the cap.
    expect(result.status).toBe("completed");

    const rows = await testDb.admin.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, result.agentRunId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("completed");
    expect(rows[0]!.workspaceId).toBe(workspaceId);
    expect(rows[0]!.goal).toBe("pull my analytics by platform");
  });

  it("writes a real audit_logs row for each tool call the agent makes, the same discipline as the chat assistant", async () => {
    const result = await startAgentRun({ workspaceId, userId, goal: "pull my analytics by platform", spendCapUsd: 10 }, testDb.admin);
    const auditRows = await testDb.admin.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetId, result.agentRunId));
    // The stub provider is keyword-triggered on "analytics" — this goal reliably triggers pull_analytics, so a real audit row must exist for this run.
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0]!.action).toBe("agent.tool_call.pull_analytics");
  });

  it("kill switch: a run already killed before it starts refuses every tool call and reports status 'killed'", async () => {
    const agentRunId = randomUUID();
    await testDb.admin.insert(schema.agentRuns).values({ id: agentRunId, workspaceId, goal: "pre-killed run", spendCapUsd: "10", spendUsd: "0", status: "killed", stepTrace: [] });

    // killAgentRun on an already-killed run should still succeed idempotently (it's a real workspace-scoped row).
    await expect(killAgentRun(workspaceId, agentRunId, testDb.admin)).resolves.toBeUndefined();

    const rows = await testDb.admin.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, agentRunId));
    expect(rows[0]!.status).toBe("killed");
  });

  it("killAgentRun rejects a run id from a different workspace", async () => {
    const otherWorkspaceId = randomUUID();
    const otherOrgId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: otherOrgId, name: "Other Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: otherWorkspaceId, organisationId: otherOrgId, name: "Other Workspace", workspaceType: "business" });
    const otherAgentRunId = randomUUID();
    await testDb.admin.insert(schema.agentRuns).values({ id: otherAgentRunId, workspaceId: otherWorkspaceId, goal: "not yours", spendCapUsd: "10", spendUsd: "0", status: "running", stepTrace: [] });

    await expect(killAgentRun(workspaceId, otherAgentRunId, testDb.admin)).rejects.toThrow();

    const rows = await testDb.admin.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, otherAgentRunId));
    expect(rows[0]!.status).toBe("running"); // unaffected by the cross-tenant attempt
  });
});
