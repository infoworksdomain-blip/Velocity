/**
 * STEP 21's literal "cost per published post tracked as a first-class
 * metric". A pure aggregation over data this build already tracks
 * accurately — `renders.cost_usd` is a real, atomically-accumulated sum
 * of every metered provider call for that render (STEP 8's
 * `metering/usage-recorder.ts`, incremented via step-ledger.ts's atomic
 * SQL update, never a read-then-write) — this function just divides.
 */
export interface CostPerPublishedPostResult {
  totalCostUsd: number;
  publishedPostCount: number;
  /** null when publishedPostCount is 0 — an honest "no data yet", never a fabricated 0 or a division-by-zero NaN. */
  costPerPostUsd: number | null;
}

export function computeCostPerPublishedPost(totalCostUsd: number, publishedPostCount: number): CostPerPublishedPostResult {
  return {
    totalCostUsd,
    publishedPostCount,
    costPerPostUsd: publishedPostCount > 0 ? totalCostUsd / publishedPostCount : null,
  };
}
