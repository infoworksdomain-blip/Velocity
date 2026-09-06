import { type PlanKey } from "./seat-limits";

/**
 * Placeholder plan credit allowances, mirroring seat-limits.ts's own
 * disclaimer: STEP 19 (Billing) owns the authoritative plan/pricing
 * model. This exists only so STEP 7's Dashboard can render a CreditMeter
 * with a real denominator instead of a fabricated one. Treat these
 * numbers as provisional; STEP 19 should replace this module's source of
 * truth, not just its values.
 */
export const PLAN_CREDIT_LIMITS: Record<PlanKey, number> = {
  free: 50,
  starter: 500,
  growth: 2000,
  pro: 10000,
};
