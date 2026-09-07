import { fileURLToPath } from "node:url";
import { schema, LocalDevKmsProvider } from "@velocity/db";
import { createPgliteTestDb, type PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { eq, and } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as activities from "../temporal/activities/index.js";
import { resetActivityContextForTests, setRunInWorkspaceTxForTests } from "../temporal/activities/context.js";
import { RENDER_TASK_QUEUE } from "../temporal/task-queues.js";
import { buildPublishFixture } from "./helpers/publish-fixtures.js";
import { useTestEncryptionKeyForTests } from "./helpers/kms-env.js";

useTestEncryptionKeyForTests();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * GATE 12's chaos-test claim, made mechanical: "kill workers mid-publish;
 * nothing double-posts." Simulated the same way STEP 8's own idempotency
 * test simulates a worker crash — a poll call that throws exactly once,
 * forcing Temporal to retry the `poll` activity from scratch. What's
 * actually under test is whether that retry calls TikTok's init endpoint
 * AGAIN (a duplicate draft video — a real bug) or resumes against the
 * externalJobId `platformInit` already persisted (correct).
 */
describe("publish workflow — idempotency under a simulated worker crash (GATE 12's chaos-test claim)", () => {
  let testDb: PgliteTestDb;
  let testEnv: TestWorkflowEnvironment;
  let kms: LocalDevKmsProvider;

  beforeAll(async () => {
    testDb = await createPgliteTestDb();
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

  it("a poll call that fails once, then retries, resumes against the SAME externalJobId instead of re-initing", async () => {
    const { input, renderOutputKey } = await buildPublishFixture(testDb, kms, { platform: "tiktok" });

    let initCallCount = 0;
    let statusFetchCallCount = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/inbox/video/init/")) {
        initCallCount += 1;
        return jsonResponse({ data: { publish_id: "v_inbox_file~v2.abc" }, error: { code: "ok", message: "", log_id: "1" } });
      }
      if (u.includes("/status/fetch/")) {
        statusFetchCallCount += 1;
        if (statusFetchCallCount === 1) throw new Error("SIMULATED CRASH: worker died mid-poll");
        return jsonResponse({ data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok", message: "", log_id: "1" } });
      }
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

    const result = await worker.runUntil(
      testEnv.client.workflow.execute("publishWorkflow", {
        workflowId: `publish:${input.publicationId}`,
        taskQueue: RENDER_TASK_QUEUE,
        args: [input],
      }),
    );

    expect(result.status).toBe("published");

    // The actual claim: init (the call that would create a SECOND draft
    // video on TikTok's side if repeated) was called exactly once, even
    // though the poll call failed once and Temporal retried the activity.
    expect(initCallCount).toBe(1);
    expect(statusFetchCallCount).toBeGreaterThan(1); // proves a retry genuinely happened, not that the crash was a no-op

    const stepRows = await testDb.admin
      .select()
      .from(schema.publicationSteps)
      .where(and(eq(schema.publicationSteps.publicationId, input.publicationId), eq(schema.publicationSteps.stepKey, "platform_init")));
    expect(stepRows).toHaveLength(1);
    expect(stepRows[0]?.state).toBe("succeeded");
    expect(stepRows[0]?.externalJobId).toBe("v_inbox_file~v2.abc");
  }, 60000);
});
