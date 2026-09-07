/**
 * ProviderRouter — real capability-match, cost-ceiling, health, and
 * circuit-breaker selection logic (STEP 8, ADR 0004). The STEP 1 stub
 * shapes (`ProviderRouter<T>`, `RouterSelectionCriteria`) had no callers
 * anywhere in the codebase, so this replaces them outright rather than
 * keeping unused legacy aliases alongside the real implementation.
 */
export * from "./router/index.js";
