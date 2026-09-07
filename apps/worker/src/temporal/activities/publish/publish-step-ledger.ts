import { randomUUID } from "node:crypto";
import type { PublicationStepKind } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import type { WorkspaceDb } from "../step-ledger.js";

/**
 * The publish pipeline's idempotency ledger (STEP 12) — the same
 * claim-before-side-effect shape as render_steps'/step-ledger.ts's
 * `withStep`, adapted: no cost/metering (publish API calls aren't
 * billed — C5 only meters generative provider calls), and no polling
 * loop inside (the workflow's own `poll` step handles that separately,
 * reading the external id this ledger persisted).
 *
 * Two shapes, because two genuinely different things get memoized here:
 * `runIdempotentStep` memoizes a one-shot computation's JSON-serialisable
 * RESULT (preflight, mediaStage, upload, confirm, record — each runs
 * exactly once and its output is small enough to store as JSON).
 * `claimPlatformInit`/`completePlatformInit` is the one step that hands
 * back an externalJobId a LATER step (poll) must read independently of
 * whatever process instance ran platformInit — hence dedicated typed
 * columns (external_job_id, upload_target) rather than opaque JSON.
 */

export interface PublishStepBaseContext {
  runInWorkspaceTx: <T>(fn: (db: WorkspaceDb) => Promise<T>) => Promise<T>;
  workspaceId: string;
  publicationId: string;
  stepKind: PublicationStepKind;
}

/**
 * The whole check-claim-compute-persist sequence runs inside ONE
 * transaction (via a single `runInWorkspaceTx` call), exactly like
 * render_steps' `claimOrResume` — deliberately, not an oversight. Each of
 * these steps is a single fast call (a handful of DB reads, one HTTP
 * call), never a multi-minute poll, so holding one transaction open for
 * it is the same acceptable tradeoff render's own step-ledger documents:
 * if the process crashes AFTER `compute()`'s side effect lands on the
 * vendor's side but BEFORE this transaction commits, that phantom vendor
 * state has no local record — a real, acknowledged edge (see
 * docs/steps/STEP-12.md) — but the alternative (splitting claim and
 * persist across separate transactions) reopens the exact double-submit
 * race this ledger exists to prevent, which is strictly worse.
 */
export async function runIdempotentStep<T>(ctx: PublishStepBaseContext, compute: (db: WorkspaceDb) => Promise<T>): Promise<T> {
  const stepKey = ctx.stepKind; // one occurrence per kind per publication — no regeneration-round variability like render_steps has

  return ctx.runInWorkspaceTx(async (db) => {
    const existing = await db.select().from(schema.publicationSteps).where(and(eq(schema.publicationSteps.publicationId, ctx.publicationId), eq(schema.publicationSteps.stepKey, stepKey))).limit(1);
    if (existing[0]?.state === "succeeded") {
      return existing[0].output as T;
    }

    if (!existing[0]) {
      await db
        .insert(schema.publicationSteps)
        .values({ id: randomUUID(), workspaceId: ctx.workspaceId, publicationId: ctx.publicationId, stepKey, stepKind: ctx.stepKind, state: "running" })
        .onConflictDoNothing({ target: [schema.publicationSteps.publicationId, schema.publicationSteps.stepKey] });
    }

    try {
      // `db` is the SAME transaction-scoped connection this ledger claim
      // is using — compute() must do all its own reads/writes through it,
      // never open a second nested runInWorkspaceTx call, or a real side
      // effect inside compute() could durably commit independently of
      // (and before) this transaction's own commit/rollback, reopening
      // the exact double-execution race this ledger exists to prevent.
      const result = await compute(db);
      await db
        .update(schema.publicationSteps)
        .set({ state: "succeeded", output: result as object, completedAt: new Date() })
        .where(and(eq(schema.publicationSteps.publicationId, ctx.publicationId), eq(schema.publicationSteps.stepKey, stepKey)));
      return result;
    } catch (error) {
      await db
        .update(schema.publicationSteps)
        .set({ state: "failed", error: error instanceof Error ? error.message : String(error) })
        .where(and(eq(schema.publicationSteps.publicationId, ctx.publicationId), eq(schema.publicationSteps.stepKey, stepKey)));
      throw error;
    }
  });
}

export interface PlatformInitHandle {
  externalJobId: string;
  uploadTarget: string | null;
}

/**
 * The critical claim: if a `platform_init` row already carries an
 * externalJobId (state `running` or `succeeded`), that vendor-side
 * upload session/container/draft ALREADY EXISTS — a resumed activity
 * must reuse it, never call the vendor's init endpoint again. This is
 * GATE 12's chaos-test property, mechanically enforced the same way
 * render_steps prevents a duplicate `generate()` call.
 */
export async function claimPlatformInit(ctx: PublishStepBaseContext, submit: (db: WorkspaceDb) => Promise<PlatformInitHandle>): Promise<PlatformInitHandle> {
  const stepKey = "platform_init";

  return ctx.runInWorkspaceTx(async (db) => {
    const existing = await db.select().from(schema.publicationSteps).where(and(eq(schema.publicationSteps.publicationId, ctx.publicationId), eq(schema.publicationSteps.stepKey, stepKey))).limit(1);
    if (existing[0]?.externalJobId) {
      return { externalJobId: existing[0].externalJobId, uploadTarget: existing[0].uploadTarget };
    }

    if (!existing[0]) {
      await db
        .insert(schema.publicationSteps)
        .values({ id: randomUUID(), workspaceId: ctx.workspaceId, publicationId: ctx.publicationId, stepKey, stepKind: "platform_init", state: "running" })
        .onConflictDoNothing({ target: [schema.publicationSteps.publicationId, schema.publicationSteps.stepKey] });
    }

    const handle = await submit(db);
    await db
      .update(schema.publicationSteps)
      .set({ externalJobId: handle.externalJobId, uploadTarget: handle.uploadTarget, state: "succeeded", completedAt: new Date() })
      .where(and(eq(schema.publicationSteps.publicationId, ctx.publicationId), eq(schema.publicationSteps.stepKey, stepKey)));
    return handle;
  });
}
