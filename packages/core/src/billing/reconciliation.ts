import { creditsForUsage, type BillableJobKind } from "./credit-pricing.js";

/**
 * GATE 19's literal "ledger reconciles to provider costs" plus the build
 * script's "nightly reconciliation job alerting on >1% drift" -- checks
 * that every `usage_events` row (STEP 8's C5 metering, one per real
 * provider call) caused exactly the `credit_ledger` debit
 * `creditsForUsage` says it should have. A mismatch here is a real bug
 * signal: a provider call that ran but was never charged for (revenue
 * leak) or a charge that doesn't match the current pricing model
 * (a metering-vs-pricing drift, e.g. after a pricing change that forgot
 * to update every call site).
 */
const DRIFT_ALERT_THRESHOLD_PERCENT = 1;

export interface ReconciliationUsageEvent {
  id: string;
  jobKind: BillableJobKind;
  /** Provider-reported units -- seconds for video, ignored for every other job kind (see credit-pricing.ts). */
  units: number;
}

export interface ReconcileCreditLedgerInput {
  usageEvents: readonly ReconciliationUsageEvent[];
  /** usage_event.id -> total credits debited against it (sum, in case of a retried/duplicated write -- there should only ever be one). */
  actualCreditsByUsageEventId: ReadonlyMap<string, number>;
}

export interface ReconciliationMismatch {
  usageEventId: string;
  expectedCredits: number;
  actualCredits: number;
}

export interface ReconciliationResult {
  totalExpectedCredits: number;
  totalActualCredits: number;
  driftPercent: number;
  driftExceedsThreshold: boolean;
  mismatches: ReconciliationMismatch[];
}

export function reconcileCreditLedger(input: ReconcileCreditLedgerInput): ReconciliationResult {
  let totalExpected = 0;
  let totalActual = 0;
  const mismatches: ReconciliationMismatch[] = [];

  for (const event of input.usageEvents) {
    const expected = creditsForUsage({ jobKind: event.jobKind, durationSec: event.jobKind === "video" ? event.units : undefined });
    const actual = input.actualCreditsByUsageEventId.get(event.id) ?? 0;
    totalExpected += expected;
    totalActual += actual;
    if (expected !== actual) {
      mismatches.push({ usageEventId: event.id, expectedCredits: expected, actualCredits: actual });
    }
  }

  const driftPercent = totalExpected === 0 ? 0 : (Math.abs(totalExpected - totalActual) / totalExpected) * 100;

  return {
    totalExpectedCredits: totalExpected,
    totalActualCredits: totalActual,
    driftPercent,
    driftExceedsThreshold: driftPercent > DRIFT_ALERT_THRESHOLD_PERCENT,
    mismatches,
  };
}
