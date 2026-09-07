import { fileURLToPath } from "node:url";
import { createSeedreamStubProvider, type ImageProvider, type ProviderJobHandle } from "@velocity/providers";
import { createPgliteTestDb, type PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as activities from "../temporal/activities/index.js";
import { getProviderRegistry, setRunInWorkspaceTxForTests } from "../temporal/activities/context.js";
import { RENDER_TASK_QUEUE } from "../temporal/task-queues.js";
import { buildRenderFixture } from "./helpers/fixtures.js";
import { useRealProviderConfigForTests } from "./helpers/provider-config-env.js";

useRealProviderConfigForTests();

const CONCURRENT_RENDERS = 10;
const INJECTED_TRANSIENT_FAILURE_RATE = 0.2; // ~2 of 10 submissions hit a recoverable failure

/**
 * GATE 8: "100 concurrent renders complete with <2% failure." Run at a
 * much smaller scale here for a second, distinct reason beyond CI time
 * budget: PGlite (this harness's embedded Postgres) is a single WASM
 * engine instance with no real connection pool — every `runInWorkspaceTx`
 * call across every concurrent workflow serialises through it. Found by
 * running this test at N=25: activities started heartbeat-timing-out and
 * workflow tasks expired well before any of the render PIPELINE logic was
 * the bottleneck, which is a property of the test harness's single
 * embedded connection, not of the pipeline's real concurrency handling
 * (production runs against a real Postgres connection pool). N=10 fits
 * comfortably; the mechanism under test — the router, the idempotency
 * ledger, retry-driven recovery — doesn't change shape with N, only
 * PGlite's serialised-access ceiling does.
 *
 * Separately: this measures workflow ORCHESTRATION reliability against
 * injected transient failures — not real vendor API throughput or
 * capacity, which is the vendor's own SLA, not something this test can or
 * should claim to prove.
 *
 * Honesty note (see docs/steps/STEP-08.md): the injected failure here is
 * transient at the SUBMIT step (recoverable by Temporal's own activity
 * retry — a fresh request to the vendor, which is how real network blips
 * actually behave). Full fallback-chain walking to a SECONDARY provider
 * on a persistently failing primary (ADR 0004's fallback chain) is not
 * implemented in STEP 8 — `generateShots` uses only the router's
 * top-ranked provider. That's a real, flagged gap, not silently omitted.
 */
describe("render workflow — concurrency (GATE 8, representative scale)", () => {
  let testDb: PgliteTestDb;
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testDb = await createPgliteTestDb();
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    setRunInWorkspaceTxForTests((workspaceId, fn) => testDb.runInWorkspaceTx(workspaceId, fn));

    // Wrap the image provider so ~20% of submissions fail once (transient,
    // recoverable on Temporal's automatic activity retry) — deterministic
    // per job content so the test is reproducible, not flaky.
    const registry = getProviderRegistry();
    const realProvider = createSeedreamStubProvider(["growth"]);
    const failedOnce = new Set<string>();
    const wrapped: ImageProvider = {
      ...realProvider,
      generate: async (input) => {
        const handle = await realProvider.generate(input);
        const shouldFailOnce = hashToUnitInterval(handle.externalJobId) < INJECTED_TRANSIENT_FAILURE_RATE;
        if (shouldFailOnce && !failedOnce.has(handle.externalJobId)) {
          failedOnce.add(handle.externalJobId);
          throw new Error("SIMULATED transient vendor error at submission time");
        }
        return handle;
      },
      poll: (handle: ProviderJobHandle) => realProvider.poll(handle),
    };
    registry.register("image", "seedream-5.0", () => wrapped);
  }, 60000);

  afterAll(async () => {
    await testEnv.teardown();
    await testDb.close();
  });

  it(`completes ${CONCURRENT_RENDERS} concurrent meme renders with <2% workflow failure despite a ${INJECTED_TRANSIENT_FAILURE_RATE * 100}% injected transient failure rate`, async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: RENDER_TASK_QUEUE,
      workflowsPath: fileURLToPath(new URL("../../dist/temporal/workflows/index.js", import.meta.url)),
      activities,
      maxConcurrentActivityTaskExecutions: 5,
      maxConcurrentWorkflowTaskExecutions: 5,
    });

    const inputs = await Promise.all(Array.from({ length: CONCURRENT_RENDERS }, () => buildRenderFixture(testDb, { format: "meme" })));

    const results = await worker.runUntil(
      Promise.allSettled(
        inputs.map((input) =>
          testEnv.client.workflow.execute("renderWorkflow", {
            workflowId: `render:${input.renderId}`,
            taskQueue: RENDER_TASK_QUEUE,
            args: [input],
          }),
        ),
      ),
    );

    const failures = results.filter((r) => r.status === "rejected");
    const failureRate = failures.length / CONCURRENT_RENDERS;

    if (failures.length > 0) {
      console.log(`Concurrency test: ${failures.length}/${CONCURRENT_RENDERS} failed. First failure:`, (failures[0] as PromiseRejectedResult).reason?.message);
    }

    expect(failureRate).toBeLessThan(0.02);
  }, 120000);
});

function hashToUnitInterval(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0) / 0xffffffff;
}
