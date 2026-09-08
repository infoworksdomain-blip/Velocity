import { describe, expect, it } from "vitest";
import { BILLING_PLANS, getBillingPlan, resolveStripePriceId } from "../plans";
import { PLAN_CREDIT_LIMITS } from "../../plans/credit-limits";
import { PLAN_SEAT_LIMITS } from "../../plans/seat-limits";

describe("BILLING_PLANS — the authoritative pricing model STEP 4/7's placeholders asked for", () => {
  it("wraps STEP 4's seat limits and STEP 7's credit limits rather than duplicating the numbers", () => {
    for (const key of Object.keys(BILLING_PLANS) as (keyof typeof BILLING_PLANS)[]) {
      expect(BILLING_PLANS[key].creditAllowance).toBe(PLAN_CREDIT_LIMITS[key]);
      expect(BILLING_PLANS[key].seatLimit).toBe(PLAN_SEAT_LIMITS[key]);
    }
  });

  it("the free plan has no monthly price and no Stripe price env var", () => {
    expect(BILLING_PLANS.free.monthlyPriceUsd).toBe(0);
    expect(BILLING_PLANS.free.stripePriceEnvVar).toBeNull();
  });

  it("every paid plan costs more than the one below it", () => {
    expect(BILLING_PLANS.starter.monthlyPriceUsd).toBeGreaterThan(BILLING_PLANS.free.monthlyPriceUsd);
    expect(BILLING_PLANS.growth.monthlyPriceUsd).toBeGreaterThan(BILLING_PLANS.starter.monthlyPriceUsd);
    expect(BILLING_PLANS.pro.monthlyPriceUsd).toBeGreaterThan(BILLING_PLANS.growth.monthlyPriceUsd);
  });
});

describe("getBillingPlan", () => {
  it("returns the matching plan", () => {
    expect(getBillingPlan("growth").key).toBe("growth");
  });
});

describe("resolveStripePriceId", () => {
  it("throws for the free plan — there is no Stripe price to resolve", () => {
    expect(() => resolveStripePriceId("free", {})).toThrow(/free plan/);
  });

  it("throws when the env var is not set, rather than sending an undefined price id to Stripe", () => {
    expect(() => resolveStripePriceId("starter", {})).toThrow(/STRIPE_PRICE_STARTER/);
  });

  it("resolves the real price id from the injected environment", () => {
    expect(resolveStripePriceId("starter", { STRIPE_PRICE_STARTER: "price_abc123" })).toBe("price_abc123");
  });
});
