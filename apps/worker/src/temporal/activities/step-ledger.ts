import { randomUUID } from "node:crypto";
import { metering } from "@velocity/core";
import type { RenderStepKind } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * The base drizzle class both the production NodePgDatabase driver and the
 * PGlite driver used by this package's own tests extend — typed against
 * this rather than @velocity/db's concrete `Database` (= NodePgDatabase)
 * so the exact same withStep function runs against a real embedded
 * Postgres (PGlite) in tests and a real network Postgres in production,
 * with no test-only branching in the implementation itself.
 */
export type WorkspaceDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The idempotency ledger (STEP 8.4, ADR 0006) — the actual mechanism
 * behind GATE 8's "a killed worker mid-render resumes without duplicate
 * spend." One row per logical step, keyed by (render_id, step_key), where
 * step_key is deterministic and content-addressed (derived from the
 * step's own input by the caller, not a random id) — a retry after any
 * crash re-derives the SAME key, so it always looks up the same row.
 *
 * Deliberately three SHORT, separate DB round-trips rather than one
 * transaction spanning the whole function: (1) check/claim the row, (2)
 * call the provider — no transaction held open here at all, since a real
 * vendor render can take minutes and holding a Postgres transaction open
 * for that long is a real anti-pattern (idle-in-transaction, held locks),
 * (3) commit the result. The critical ordering is between (1) and (2):
 * after `submit()`, the resulting provider_id/external_job_id is persisted
 * BEFORE the first poll. If a worker is killed while polling, a resumed
 * activity finds the row already `running` with a job id attached and
 * resumes polling that SAME job — it never calls `submit()` again. Getting
 * this ordering backwards (persisting the job id only after the poll loop
 * finishes) is the exact bug this ledger exists to prevent.
 */

export type ProviderJobState = "queued" | "processing" | "succeeded" | "failed";

export interface StepProviderStatus {
  state: ProviderJobState;
  outputUrl?: string;
  errorMessage?: string;
  costUsd: number;
  providerReportedCostUsd?: number;
  [extra: string]: unknown;
}

export interface StepProviderHandle {
  providerId: string;
  externalJobId: string;
}

export interface WithStepContext {
  /** Opens a short-lived, workspace-scoped (RLS) transaction for one DB round-trip — call this multiple times, never once for the whole step. */
  runInWorkspaceTx: <T>(fn: (db: WorkspaceDb) => Promise<T>) => Promise<T>;
  workspaceId: string;
  renderId: string;
  stepKind: RenderStepKind;
  stepKey: string;
  provider: { id: string; model: string };
  jobKind: "video" | "image" | "text" | "tts" | "transcription";
  units: number;
  /** C5 scopes metering to AI provider calls — a non-generative step (compose, normalise, provenance) still gets the idempotency ledger but must not write a spurious $0 usage_event that would pollute cost reconciliation. */
  skipMetering?: boolean;
  submit: () => Promise<StepProviderHandle>;
  poll: (handle: StepProviderHandle) => Promise<StepProviderStatus>;
  heartbeat?: () => void;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export interface StepResult {
  output: StepProviderStatus;
  costUsd: number;
  fromCache: boolean;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimOrResume(ctx: WithStepContext): Promise<{ done: StepResult } | { handle: StepProviderHandle; rowId: string; attempt: number }> {
  return ctx.runInWorkspaceTx(async (db) => {
    const existing = await db
      .select()
      .from(schema.renderSteps)
      .where(and(eq(schema.renderSteps.renderId, ctx.renderId), eq(schema.renderSteps.stepKey, ctx.stepKey)))
      .limit(1);
    let row = existing[0];

    if (row && row.state === "succeeded") {
      return { done: { output: (row.output as StepProviderStatus) ?? { state: "succeeded", costUsd: 0 }, costUsd: Number(row.costUsd), fromCache: true } };
    }
    if (row && row.state === "running" && row.providerId && row.externalJobId) {
      return { handle: { providerId: row.providerId, externalJobId: row.externalJobId }, rowId: row.id, attempt: row.attempt };
    }

    if (!row) {
      await db
        .insert(schema.renderSteps)
        .values({ id: randomUUID(), workspaceId: ctx.workspaceId, renderId: ctx.renderId, stepKey: ctx.stepKey, stepKind: ctx.stepKind, state: "pending" })
        .onConflictDoNothing({ target: [schema.renderSteps.renderId, schema.renderSteps.stepKey] });

      const reSelected = await db
        .select()
        .from(schema.renderSteps)
        .where(and(eq(schema.renderSteps.renderId, ctx.renderId), eq(schema.renderSteps.stepKey, ctx.stepKey)))
        .limit(1);
      row = reSelected[0];
    }
    if (!row) throw new Error(`render_steps row for ${ctx.renderId}/${ctx.stepKey} was not found after insert — this is a step-ledger bug`);

    if (row.state === "succeeded") {
      return { done: { output: (row.output as StepProviderStatus) ?? { state: "succeeded", costUsd: 0 }, costUsd: Number(row.costUsd), fromCache: true } };
    }
    if (row.state === "running" && row.providerId && row.externalJobId) {
      return { handle: { providerId: row.providerId, externalJobId: row.externalJobId }, rowId: row.id, attempt: row.attempt };
    }

    // Still pending — claim it by submitting now, then persist the job id immediately, in this same short transaction.
    const handle = await ctx.submit();
    await db
      .update(schema.renderSteps)
      .set({ state: "running", providerId: handle.providerId, externalJobId: handle.externalJobId, attempt: row.attempt + 1 })
      .where(eq(schema.renderSteps.id, row.id));
    return { handle, rowId: row.id, attempt: row.attempt + 1 };
  });
}

export async function withStep(ctx: WithStepContext): Promise<StepResult> {
  const claim = await claimOrResume(ctx);
  if ("done" in claim) return claim.done;
  const { handle, rowId } = claim;

  // No DB transaction held here — this can legitimately take minutes for a real vendor.
  const pollIntervalMs = ctx.pollIntervalMs ?? 25;
  const maxPollAttempts = ctx.maxPollAttempts ?? 400;
  let status: StepProviderStatus | null = null;
  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    ctx.heartbeat?.();
    status = await ctx.poll(handle);
    if (status.state === "succeeded" || status.state === "failed") break;
    await sleep(pollIntervalMs);
  }
  if (!status || status.state === "queued" || status.state === "processing") {
    throw new Error(`Step ${ctx.stepKey} did not reach a terminal state within ${maxPollAttempts} poll attempts`);
  }

  if (status.state === "failed") {
    await ctx.runInWorkspaceTx((db) =>
      db
        .update(schema.renderSteps)
        .set({ state: "failed", error: status!.errorMessage ?? "provider reported failure" })
        .where(eq(schema.renderSteps.id, rowId)),
    );
    throw new Error(`Step ${ctx.stepKey} failed: ${status.errorMessage ?? "unknown provider error"}`);
  }

  const finalStatus = status;
  return ctx.runInWorkspaceTx(async (db) => {
    return db.transaction(async (tx: WorkspaceDb) => {
      const updated = await tx
        .update(schema.renderSteps)
        .set({
          state: "succeeded",
          output: finalStatus,
          costUsd: finalStatus.costUsd.toString(),
          providerReportedCostUsd: finalStatus.providerReportedCostUsd?.toString(),
          completedAt: new Date(),
        })
        .where(and(eq(schema.renderSteps.id, rowId), eq(schema.renderSteps.state, "running")))
        .returning({ id: schema.renderSteps.id });

      if (updated.length === 0) {
        // A concurrent attempt already won this row — read back its result, no double-meter.
        const winner = await tx.select().from(schema.renderSteps).where(eq(schema.renderSteps.id, rowId)).limit(1);
        return { output: (winner[0]?.output as StepProviderStatus) ?? finalStatus, costUsd: Number(winner[0]?.costUsd ?? 0), fromCache: true };
      }

      if (!ctx.skipMetering) {
        const { usageEventId } = await metering.recordUsage(tx, {
          workspaceId: ctx.workspaceId,
          provider: ctx.provider.id,
          model: ctx.provider.model,
          units: ctx.units,
          costUsd: finalStatus.costUsd,
          jobKind: ctx.jobKind,
          referenceId: ctx.renderId,
        });
        await tx.update(schema.renderSteps).set({ usageEventId }).where(eq(schema.renderSteps.id, rowId));
      }

      // Atomic SQL-side increment, not read-then-write — two steps completing concurrently must both land.
      await tx
        .update(schema.renders)
        .set({ costUsd: sql`${schema.renders.costUsd} + ${finalStatus.costUsd}` })
        .where(eq(schema.renders.id, ctx.renderId));

      return { output: finalStatus, costUsd: finalStatus.costUsd, fromCache: false };
    });
  });
}
