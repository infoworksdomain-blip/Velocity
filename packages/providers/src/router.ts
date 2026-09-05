/**
 * ProviderRouter — selection shape only (ADR 0004). Real capability-match,
 * cost-ceiling, health, and circuit-breaker logic arrives in STEP 8. This
 * stub exists so downstream packages can compile against a stable interface.
 */

export interface RouterSelectionCriteria {
  workspaceTier: string;
  costCeilingUsd: number;
  requiredCapabilities: Partial<Record<string, unknown>>;
}

export interface ProviderRouter<TProvider> {
  select(criteria: RouterSelectionCriteria): TProvider;
}
