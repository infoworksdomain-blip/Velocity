import { fileURLToPath } from "node:url";
import { schema } from "@velocity/db";
import { createPgliteTestDb, type PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as activities from "../temporal/activities/index.js";
import { resetActivityContextForTests, setRunInWorkspaceTxForTests } from "../temporal/activities/context.js";
import { RENDER_TASK_QUEUE } from "../temporal/task-queues.js";
import { buildRenderFixture } from "./helpers/fixtures.js";
import { useRealProviderConfigForTests } from "./helpers/provider-config-env.js";

useRealProviderConfigForTests();

/**
 * A genuine end-to-end run of the render workflow: a real Temporal test
 * environment (in-process, time-skipping), a real embedded Postgres
 * (PGlite) with real RLS, real migrations, and real FK constraints, and
 * the actual production activities/workflow code — only the vendor
 * providers are stubs (no funded API keys, see docs/steps/STEP-08.md).
 */
describe("render workflow — happy path (STEP 8.4, real Temporal + real embedded Postgres)", () => {
  let testDb: PgliteTestDb;
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testDb = await createPgliteTestDb();
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 60000);

  afterEach(() => {
    resetActivityContextForTests();
  });

  afterAll(async () => {
    await testEnv.teardown();
    await testDb.close();
  });

  it("completes a meme render end-to-end and leaves real, consistent database state", async () => {
    setRunInWorkspaceTxForTests((workspaceId, fn) => testDb.runInWorkspaceTx(workspaceId, fn));

    const input = await buildRenderFixture(testDb, { format: "meme" });

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: RENDER_TASK_QUEUE,
      // Points at the COMPILED dist output, not the .ts source next to this
      // test file — Temporal's own bundler (a separate webpack build, not
      // vitest's transform pipeline) needs real JS on disk. `pnpm test`
      // runs `pnpm build` first for exactly this reason (package.json).
      workflowsPath: fileURLToPath(new URL("../../dist/temporal/workflows/index.js", import.meta.url)),
      activities,
    });

    const result = await worker.runUntil(
      testEnv.client.workflow.execute("renderWorkflow", {
        workflowId: `render:${input.renderId}`,
        taskQueue: RENDER_TASK_QUEUE,
        args: [input],
      }),
    );

    expect(result.status).toBe("succeeded");
    expect(result.outputStorageKey).toBeTruthy();
    expect(result.qc.verdict).toBe("pass");
    expect(result.provenance.aiGenerated).toBe(true);
    expect(result.provenance.c2paManifestRef).toBeTruthy();

    // Real database assertions — not just the workflow's return value.
    const renderRows = await testDb.admin.select().from(schema.renders).where(eq(schema.renders.id, input.renderId));
    expect(renderRows[0]?.status).toBe("succeeded");
    expect(renderRows[0]?.qcPassed).toBe(true);
    expect(Number(renderRows[0]?.costUsd)).toBeGreaterThan(0);

    const contentItemRows = await testDb.admin.select().from(schema.contentItems).where(eq(schema.contentItems.id, input.contentItemId));
    expect(contentItemRows[0]?.status).toBe("ready");

    const mediaAssetRows = await testDb.admin.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.renderId, input.renderId));
    expect(mediaAssetRows).toHaveLength(1);
    expect(mediaAssetRows[0]?.sourceKind).toBe("render_output");

    const stepRows = await testDb.admin.select().from(schema.renderSteps).where(eq(schema.renderSteps.renderId, input.renderId));
    const succeededKinds = stepRows.filter((r) => r.state === "succeeded").map((r) => r.stepKind);
    expect(succeededKinds).toContain("generate_shot");
    expect(succeededKinds).toContain("compose");

    const usageEventRows = await testDb.admin.select().from(schema.usageEvents).where(eq(schema.usageEvents.referenceId, input.renderId));
    expect(usageEventRows.length).toBeGreaterThan(0); // C5: the generative shot call was metered
    // No explicit worker.shutdown() here — runUntil() already stops the
    // worker once the awaited workflow settles; calling shutdown() again
    // throws IllegalStateError("Not running").
  }, 60000);
});
