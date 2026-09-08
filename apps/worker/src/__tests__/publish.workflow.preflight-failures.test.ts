import { fileURLToPath } from "node:url";
import { schema, LocalDevKmsProvider } from "@velocity/db";
import { createPgliteTestDb, type PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { social } from "@velocity/core";
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

/**
 * Preflight's real job (build script: "validate spec compliance...quota
 * headroom, token validity, QC pass...") is to reject BEFORE any vendor
 * call happens. Both tests here assert zero fetch calls — the actual
 * proof that a bad publication never reaches TikTok/Instagram/YouTube at
 * all, not just that the final status ends up "failed".
 */
describe("publish workflow — preflight rejections never reach a vendor (STEP 12)", () => {
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

  async function runWorkflow(workflowId: string, input: unknown) {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: RENDER_TASK_QUEUE,
      workflowsPath: fileURLToPath(new URL("../../dist/temporal/workflows/index.js", import.meta.url)),
      activities,
    });
    return worker.runUntil(testEnv.client.workflow.execute("publishWorkflow", { workflowId, taskQueue: RENDER_TASK_QUEUE, args: [input] }));
  }

  it("fails terminal, with no vendor call, when the social account needs reconnecting", async () => {
    const { input } = await buildPublishFixture(testDb, kms, { platform: "tiktok", connectionStatus: "reauth_required" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWorkflow(`publish:${input.publicationId}`, input);

    expect(result.status).toBe("failed");
    expect(result.failureKind).toBe("terminal");
    expect(fetchMock).not.toHaveBeenCalled();

    const attemptRows = await testDb.admin.select().from(schema.publicationAttempts).where(eq(schema.publicationAttempts.publicationId, input.publicationId));
    expect(attemptRows[0]?.outcome).toBe("terminal_failure");
  }, 60000);

  it("fails with failureKind quota, with no vendor call, when the account has no quota headroom left", async () => {
    const { input } = await buildPublishFixture(testDb, kms, { platform: "tiktok" });

    // Exhaust the account's quota BEFORE the workflow runs — same cap (15/24h) preflight.ts itself uses.
    for (let i = 0; i < 15; i++) {
      await testDb.runInWorkspaceTx(input.workspaceId, (db) => social.checkAndIncrementQuota(db, { workspaceId: input.workspaceId, socialAccountId: input.socialAccountId, requestKind: "publish", windowSeconds: 86400, requestCap: 15 }));
    }

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWorkflow(`publish:${input.publicationId}`, input);

    expect(result.status).toBe("failed");
    expect(result.failureKind).toBe("quota");
    expect(fetchMock).not.toHaveBeenCalled();

    const attemptRows = await testDb.admin.select().from(schema.publicationAttempts).where(eq(schema.publicationAttempts.publicationId, input.publicationId));
    expect(attemptRows[0]?.outcome).toBe("quota_deferred");
  }, 60000);

  it("STEP 18: fails with failureKind quota, with no vendor call, when an admin has globally paused the platform", async () => {
    const { input } = await buildPublishFixture(testDb, kms, { platform: "tiktok" });

    // The real global-pause mechanism: a platform-root feature_flags row
    // (no workspaceId, no userId) under the platform_pause:<platform>
    // convention key — see packages/core/src/admin/feature-flags.ts.
    await testDb.admin.insert(schema.featureFlags).values({ key: "platform_pause:tiktok", isEnabled: true, workspaceId: null, userId: null });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWorkflow(`publish:${input.publicationId}`, input);

    expect(result.status).toBe("failed");
    expect(result.failureKind).toBe("quota");
    expect(result.errorMessage ?? "").toContain("paused");
    expect(fetchMock).not.toHaveBeenCalled();

    const attemptRows = await testDb.admin.select().from(schema.publicationAttempts).where(eq(schema.publicationAttempts.publicationId, input.publicationId));
    expect(attemptRows[0]?.outcome).toBe("quota_deferred");
  }, 60000);
});
