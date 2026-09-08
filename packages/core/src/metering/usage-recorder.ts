import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import { creditsForUsage } from "../billing/credit-pricing.js";

/**
 * The literal implementation of C5 ("every model call — video, image, and
 * text — writes a usage_event ... before the response returns. No
 * un-metered path may exist"). This is the ONLY function in the codebase
 * permitted to write `usage_events`; every provider call in the render
 * pipeline (STEP 8) and the text engine (STEP 8B) goes through it or it
 * doesn't happen — the point of centralising this in one place is that a
 * missing-meter bug becomes "someone forgot to call recordUsage" (a
 * one-line diff to fix and a one-place review to catch) rather than N
 * scattered insert statements that can each independently drift.
 *
 * Takes only the minimal structural slice of a Drizzle transaction it
 * actually needs (`insert`), not the whole `Database`/transaction type —
 * this keeps it trivially mockable in tests without a live Postgres.
 */
// Structural type matching drizzle's `db.insert(table).values(...)` chain,
// narrow enough to mock without importing drizzle's full generic machinery.
// `table: any` (not `unknown`) is deliberate: a real drizzle db/transaction's
// actual `insert<TTable extends PgTable>(table: TTable)` signature is only
// assignable to this interface when the parameter type is permissive enough
// to absorb it — `unknown` is too strict here and rejects the real method.
export interface UsageRecorderTx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (table: any) => { values: (values: Record<string, unknown>) => Promise<unknown> };
}

export interface RecordUsageInput {
  workspaceId: string;
  provider: string;
  model: string;
  units: number;
  costUsd: number;
  jobKind: "video" | "image" | "text" | "tts" | "transcription";
  referenceId?: string;
}

export interface RecordUsageResult {
  usageEventId: string;
}

export async function recordUsage(tx: UsageRecorderTx, input: RecordUsageInput): Promise<RecordUsageResult> {
  const usageEventId = randomUUID();

  await tx.insert(schema.usageEvents).values({
    id: usageEventId,
    workspaceId: input.workspaceId,
    provider: input.provider,
    model: input.model,
    units: input.units.toString(),
    costUsd: input.costUsd.toString(),
    jobKind: input.jobKind,
    referenceId: input.referenceId ?? null,
  });

  // STEP 19: market-anchored credits-per-output-unit (video/image/tts/
  // transcription/text each priced by what they ARE, not by whichever
  // vendor happened to fulfil the call) — see billing/credit-pricing.ts.
  const debitCredits = creditsForUsage({ jobKind: input.jobKind, durationSec: input.jobKind === "video" ? input.units : undefined });

  await tx.insert(schema.creditLedger).values({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    debit: debitCredits,
    credit: 0,
    reason: `${input.jobKind}_generate`,
    referenceId: usageEventId,
  });

  return { usageEventId };
}
