/**
 * Per-automation spend cap (build script module 17: "per-automation spend
 * cap") and the AI Agent hard spend ceiling (build script: "goal-directed
 * runs... hard spend ceiling"). Same pure check, two callers — an
 * automation's cap is checked against its own run history's summed cost
 * before firing again; an agent run's cap is checked against its own
 * accumulated spend before each tool round (packages/core/src/agents).
 */

export interface SpendCapCheckResult {
  allowed: boolean;
  reason: string | null;
}

export function checkSpendCap(currentSpendUsd: number, capUsd: number | null, projectedNextCostUsd = 0): SpendCapCheckResult {
  if (capUsd === null) return { allowed: true, reason: null };
  const projectedTotal = currentSpendUsd + projectedNextCostUsd;
  if (projectedTotal > capUsd) {
    return { allowed: false, reason: `Projected spend $${projectedTotal.toFixed(2)} would exceed the $${capUsd.toFixed(2)} cap (current: $${currentSpendUsd.toFixed(2)})` };
  }
  return { allowed: true, reason: null };
}
