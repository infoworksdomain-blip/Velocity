import { fileURLToPath } from "node:url";
import { schema, LocalDevKmsProvider } from "@velocity/db";
import { createPgliteTestDb, type PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as activities from "../temporal/activities/index.js";
import { resetActivityContextForTests, setAdminDbForTests, setRunInWorkspaceTxForTests } from "../temporal/activities/context.js";
import { RENDER_TASK_QUEUE } from "../temporal/task-queues.js";
import { buildPublishFixture } from "./helpers/publish-fixtures.js";
import { useTestEncryptionKeyForTests } from "./helpers/kms-env.js";

useTestEncryptionKeyForTests();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * GATE 12: "50 scheduled posts publish across three platforms with zero
 * duplicates." The outermost dedupe layer — same one render's own
 * startRenderWorkflow relies on — is the deterministic workflow id
 * (`publish:${publicationId}`) plus REJECT_DUPLICATE: two attempts to
 * trigger a publish for the same publication (e.g. a double-clicked
 * "Publish" button) can never both run to completion, because the
 * second `start()` call itself is rejected before any activity runs —
 * proven directly here rather than only inferred from the idempotency
 * ledger (which protects WITHIN one workflow execution, not across two).
 */
describe("publish workflow — duplicate trigger rejection (GATE 12: zero duplicates)", () => {
  let testDb: PgliteTestDb;
  let testEnv: TestWorkflowEnvironment;
  let kms: LocalDevKmsProvider;

  beforeAll(async () => {
    testDb = await createPgliteTestDb();
    setAdminDbForTests(testDb.admin);
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    kms = new LocalDevKmsProvider("a".repeat(64));
  }, 60000);

  beforeEach(() => {
    setRunInWorkspaceTxForTests((workspaceId, fn) => testDb.runInWorkspaceTx(workspaceId, fn));
  });

  afterEach(() => {
    resetActivityContextForTests();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await testEnv.teardown();
    await testDb.close();
  });

  it("rejects a second start() for the same publicationId, leaving exactly one succeeded attempt", async () => {
    const { input, renderOutputKey } = await buildPublishFixture(testDb, kms, { platform: "tiktok" });

    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/inbox/video/init/")) return jsonResponse({ data: { publish_id: "v_inbox_file~v2.abc" }, error: { code: "ok", message: "", log_id: "1" } });
      if (u.includes("/status/fetch/")) return jsonResponse({ data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok", message: "", log_id: "1" } });
      throw new Error(`Unexpected fetch to ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getBlobStore } = await import("../temporal/activities/context.js");
    await getBlobStore().put(renderOutputKey, Buffer.from("fake-mp4-bytes"));

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: RENDER_TASK_QUEUE,
      workflowsPath: fileURLToPath(new URL("../../dist/temporal/workflows/index.js", import.meta.url)),
      activities,
    });

    const workflowId = `publish:${input.publicationId}`;
    const startOpts = { workflowId, taskQueue: RENDER_TASK_QUEUE, args: [input], workflowIdReusePolicy: WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE };

    await worker.runUntil(async () => {
      const firstHandle = await testEnv.client.workflow.start("publishWorkflow", startOpts);
      await expect(testEnv.client.workflow.start("publishWorkflow", startOpts)).rejects.toThrow(WorkflowExecutionAlreadyStartedError);
      await firstHandle.result();
    });

    const attemptRows = await testDb.admin.select().from(schema.publicationAttempts).where(eq(schema.publicationAttempts.publicationId, input.publicationId));
    expect(attemptRows).toHaveLength(1);
    expect(attemptRows[0]?.outcome).toBe("succeeded");

    // Exactly one init call reached TikTok — a duplicate trigger that got
    // past the workflow-id dedupe would have shown up here as two.
    const initCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/inbox/video/init/"));
    expect(initCalls).toHaveLength(1);
  }, 60000);
});
