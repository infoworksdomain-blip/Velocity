import { describe, expect, it } from "vitest";
import { checkCanGenerate, isBlockedBySubscriptionStatus, PAST_DUE_GRACE_PERIOD_MS } from "../generation-gate";

describe("isBlockedBySubscriptionStatus", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  it("never blocks active or trialing", () => {
    expect(isBlockedBySubscriptionStatus({ status: "active", statusSince: now, now }).blocked).toBe(false);
    expect(isBlockedBySubscriptionStatus({ status: "trialing", statusSince: now, now }).blocked).toBe(false);
  });

  it("always blocks canceled and unpaid, regardless of timing", () => {
    expect(isBlockedBySubscriptionStatus({ status: "canceled", statusSince: now, now }).blocked).toBe(true);
    expect(isBlockedBySubscriptionStatus({ status: "unpaid", statusSince: now, now }).blocked).toBe(true);
  });

  it("does not block past_due within the real dunning grace period", () => {
    const statusSince = new Date(now.getTime() - (PAST_DUE_GRACE_PERIOD_MS - 1000));
    const result = isBlockedBySubscriptionStatus({ status: "past_due", statusSince, now });
    expect(result.blocked).toBe(false);
  });

  it("blocks past_due once the grace period has expired", () => {
    const statusSince = new Date(now.getTime() - (PAST_DUE_GRACE_PERIOD_MS + 1000));
    const result = isBlockedBySubscriptionStatus({ status: "past_due", statusSince, now });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("grace period");
  });
});

describe("checkCanGenerate", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  it("allows generation with sufficient balance and no subscription (free plan)", () => {
    const result = checkCanGenerate({ creditBalance: 100, requiredCredits: 50, subscription: null });
    expect(result.allowed).toBe(true);
  });

  it("refuses generation when the credit balance is below what's required — GATE 19's literal claim", () => {
    const result = checkCanGenerate({ creditBalance: 10, requiredCredits: 50, subscription: null });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Insufficient credits");
  });

  it("refuses generation for a canceled subscription even with a healthy credit balance", () => {
    const result = checkCanGenerate({ creditBalance: 1000, requiredCredits: 50, subscription: { status: "canceled", statusSince: now, now } });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("canceled");
  });

  it("allows generation for a past_due subscription still within its grace period, given a sufficient balance", () => {
    const statusSince = new Date(now.getTime() - 1000);
    const result = checkCanGenerate({ creditBalance: 100, requiredCredits: 50, subscription: { status: "past_due", statusSince, now } });
    expect(result.allowed).toBe(true);
  });

  it("a subscription block is checked before the credit balance — the reason names the subscription issue, not the balance", () => {
    const result = checkCanGenerate({ creditBalance: 0, requiredCredits: 50, subscription: { status: "unpaid", statusSince: now, now } });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("unpaid");
    expect(result.reason).not.toContain("Insufficient");
  });

  it("exact-balance generation (balance === required) is allowed, not refused off-by-one", () => {
    const result = checkCanGenerate({ creditBalance: 50, requiredCredits: 50, subscription: null });
    expect(result.allowed).toBe(true);
  });
});
