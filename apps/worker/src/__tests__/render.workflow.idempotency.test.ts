import { fileURLToPath } from "node:url";
import { schema } from "@velocity/db";
import { createPgliteTestDb, type PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { createSeedreamStubProvider, type ImageProvider } from "@velocity/providers";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as activities from "../temporal/activities/index.js";
import { getProviderRegistry, resetActivityContextForTests, setRunInWorkspaceTxForTests } from "../temporal/activities/context.js";
import { RENDER_TASK_QUEUE } from "../temporal/task-queues.js";
import { buildRenderFixture } from "./helpers/fixtures.js";
import { useRealProviderConfigForTests } from "./helpers/provider-config-env.js";

useRealProviderConfigForTests();

/**
 * GATE 8's central claim, made mechanically checkable: "a killed worker
 * mid-render resumes without duplicate spend." Simulated here as a
 * provider poll that fails exactly once — the closest in-process
 * approximation of "the activity attempt that submitted the job never
 * gets to finish polling it" (a worker crash, a heartbeat timeout, a pod
 * eviction all reduce to the same thing from the activity's point of
 * view: it gets re-invoked from scratch). Temporal's own retry policy
 * re-invokes `generateShots`; what's actually under test is whether that
 * second invocation calls the provider's `generate()` again (duplicate
 * spend — a real bug) or resumes polling the job already recorded in
 * render_steps (correct).
 */
describe("render workflow — idempotency under a simulated worker crash (GATE 8's central claim)", () => {
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

  it("a shot-generation activity that fails mid-poll, then retries, resumes the SAME job instead of re-submitting", async () => {
    setRunInWorkspaceTxForTests((workspaceId, fn) => testDb.runInWorkspaceTx(workspaceId, fn));

    // Inject a controlled "crash": the underlying provider's poll() throws
    // on its first call (simulating the activity dying before it observes
    // a terminal state), then behaves normally on every call after.
    const registry = getProviderRegistry();
    const realProvider = createSeedreamStubProvider(["growth"]);
    let pollCallCount = 0;
    let generateCallCount = 0;
    const wrappedProvider: ImageProvider = {
      ...realProvider,
      generate: async (input) => {
        generateCallCount += 1;
        return realProvider.generate(input);
      },
      poll: async (handle) => {
        pollCallCount += 1;
        if (pollCallCount === 1) throw new Error("SIMULATED CRASH: worker died mid-poll");
        return realProvider.poll(handle);
      },
    };
    registry.register("image", "seedream-5.0", () => wrappedProvider);

    const input = await buildRenderFixture(testDb, { format: "meme" });

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: RENDER_TASK_QUEUE,
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

    // The actual claim: generate() (the thing that would cost real money
    // against a real vendor) was called exactly once, even though poll()
    // failed once and the activity was retried by Temporal.
    expect(generateCallCount).toBe(1);
    expect(pollCallCount).toBeGreaterThan(1); // proves a retry genuinely happened, not that the crash was a no-op

    // And the two independent DB-side detectors agree: one step row, one usage event.
    const stepRows = await testDb.admin.select().from(schema.renderSteps).where(eq(schema.renderSteps.stepKind, "generate_shot"));
    const thisRendersSteps = stepRows.filter((r) => r.renderId === input.renderId);
    expect(thisRendersSteps).toHaveLength(1);
    expect(thisRendersSteps[0]?.state).toBe("succeeded");

    const usageEventRows = await testDb.admin.select().from(schema.usageEvents).where(eq(schema.usageEvents.referenceId, input.renderId));
    const imageUsageEvents = usageEventRows.filter((r) => r.jobKind === "image");
    expect(imageUsageEvents).toHaveLength(1);
  }, 60000);
});
