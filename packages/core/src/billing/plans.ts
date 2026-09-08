import { PLAN_CREDIT_LIMITS } from "../plans/credit-limits.js";
import { PLAN_SEAT_LIMITS, type PlanKey } from "../plans/seat-limits.js";

export type { PlanKey } from "../plans/seat-limits.js";

/**
 * STEP 19's authoritative plan/pricing model -- the doc comments on both
 * PLAN_SEAT_LIMITS (STEP 4) and PLAN_CREDIT_LIMITS (STEP 7) explicitly
 * named this step as the one that would own real pricing, and asked that
 * it replace their SOURCE of truth, not just their numbers. This module
 * does that by WRAPPING them (seat/credit allowances stay defined once,
 * where STEP 4/7 already reference them) and adding what only a real
 * pricing model needs: a monthly USD price and the Stripe Price id that
 * price maps to. `stripePriceId` is env-driven (never hardcoded -- a
 * different Stripe account per environment has different price ids for
 * the same conceptual plan), resolved lazily so importing this module
 * never requires the env vars to be set (e.g. a pure-logic unit test that
 * only needs `creditAllowance`).
 */
export interface BillingPlan {
  key: PlanKey;
  name: string;
  monthlyPriceUsd: number;
  creditAllowance: number;
  seatLimit: number;
  /** null for the free plan -- there is no Stripe subscription to create for $0/mo. */
  stripePriceEnvVar: string | null;
}

export const BILLING_PLANS: Record<PlanKey, BillingPlan> = {
  free: { key: "free", name: "Free", monthlyPriceUsd: 0, creditAllowance: PLAN_CREDIT_LIMITS.free, seatLimit: PLAN_SEAT_LIMITS.free, stripePriceEnvVar: null },
  starter: { key: "starter", name: "Starter", monthlyPriceUsd: 29, creditAllowance: PLAN_CREDIT_LIMITS.starter, seatLimit: PLAN_SEAT_LIMITS.starter, stripePriceEnvVar: "STRIPE_PRICE_STARTER" },
  growth: { key: "growth", name: "Growth", monthlyPriceUsd: 99, creditAllowance: PLAN_CREDIT_LIMITS.growth, seatLimit: PLAN_SEAT_LIMITS.growth, stripePriceEnvVar: "STRIPE_PRICE_GROWTH" },
  pro: { key: "pro", name: "Pro", monthlyPriceUsd: 299, creditAllowance: PLAN_CREDIT_LIMITS.pro, seatLimit: PLAN_SEAT_LIMITS.pro, stripePriceEnvVar: "STRIPE_PRICE_PRO" },
};

export function getBillingPlan(planKey: PlanKey): BillingPlan {
  return BILLING_PLANS[planKey];
}

/** Resolves a plan's real Stripe Price id from the environment (never hardcoded). Throws for the free plan (no Stripe price exists) or a missing env var, rather than silently sending an undefined price id to Stripe's API. */
export function resolveStripePriceId(planKey: PlanKey, env: Record<string, string | undefined> = process.env): string {
  const plan = getBillingPlan(planKey);
  if (!plan.stripePriceEnvVar) throw new Error(`Plan "${planKey}" has no Stripe price (the free plan has no subscription to create)`);
  const priceId = env[plan.stripePriceEnvVar];
  if (!priceId) throw new Error(`${plan.stripePriceEnvVar} is not set -- cannot create a Stripe subscription for plan "${planKey}"`);
  return priceId;
}

/** The inverse of resolveStripePriceId -- a webhook only carries the Stripe price id, never our own plan key, so subscription-sync needs to map back. Returns null for a price id that matches no configured plan (a real, honestly-handled case: a price created directly in the Stripe dashboard that was never wired to an env var). */
export function resolvePlanKeyFromStripePriceId(stripePriceId: string, env: Record<string, string | undefined> = process.env): PlanKey | null {
  for (const plan of Object.values(BILLING_PLANS)) {
    if (plan.stripePriceEnvVar && env[plan.stripePriceEnvVar] === stripePriceId) return plan.key;
  }
  return null;
}
