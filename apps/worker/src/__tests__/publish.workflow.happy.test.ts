import { fileURLToPath } from "node:url";
import { schema, LocalDevKmsProvider } from "@velocity/db";
import { createPgliteTestDb, type PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { eq } from "drizzle-orm";
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
 * A genuine end-to-end run of the publish workflow: a real Temporal test
 * environment, a real embedded Postgres (PGlite), and the actual
 * production activities/workflow code — only the platform HTTP calls are
 * mocked (no funded/audited TikTok/Meta/Google app credentials in this
 * sandbox, the same category of gap as every other funded-credential
 * dependency in this build — see docs/steps/STEP-11.md).
 */
describe("publish workflow — happy path (STEP 12, real Temporal + real embedded Postgres)", () => {
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

  it("publishes a TikTok draft end-to-end and leaves real, consistent database state", async () => {
    const { input, renderOutputKey } = await buildPublishFixture(testDb, kms, { platform: "tiktok" });

    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/inbox/video/init/")) return jsonResponse({ data: { publish_id: "v_inbox_file~v2.abc" }, error: { code: "ok", message: "", log_id: "1" } });
      if (u.includes("/status/fetch/")) return jsonResponse({ data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok", message: "", log_id: "1" } });
      throw new Error(`Unexpected fetch to ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // Register real bytes under the render's output key — mediaStage/upload
    // read from the SAME blob store instance the activities use internally
    // (context.ts's module singleton), so this must go through the same
    // accessor, not a private test double.
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
    expect(result.failureKind).toBeNull();

    const pubRows = await testDb.admin.select().from(schema.publications).where(eq(schema.publications.id, input.publicationId));
    expect(pubRows[0]?.status).toBe("published");

    const attemptRows = await testDb.admin.select().from(schema.publicationAttempts).where(eq(schema.publicationAttempts.publicationId, input.publicationId));
    expect(attemptRows).toHaveLength(1);
    expect(attemptRows[0]?.outcome).toBe("succeeded");

    const contentItemRows = await testDb.admin.select().from(schema.contentItems).where(eq(schema.contentItems.id, input.contentItemId));
    expect(contentItemRows[0]?.status).toBe("published");

    const stepRows = await testDb.admin.select().from(schema.publicationSteps).where(eq(schema.publicationSteps.publicationId, input.publicationId));
    const succeededKinds = stepRows.filter((r) => r.state === "succeeded").map((r) => r.stepKind);
    expect(succeededKinds).toContain("preflight");
    expect(succeededKinds).toContain("platform_init");
    expect(succeededKinds).toContain("record");

    const quotaRows = await testDb.admin.select().from(schema.platformQuotaState).where(eq(schema.platformQuotaState.socialAccountId, input.socialAccountId));
    expect(quotaRows[0]?.requestCount).toBe(1); // preflight's quota consumption actually happened, exactly once
  }, 60000);
});
