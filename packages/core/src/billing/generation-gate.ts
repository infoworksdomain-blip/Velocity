/**
 * GATE 19's literal "a workspace at its cap cannot generate" -- the real
 * enforcement gate. Nothing in this codebase read `credit_balances` as
 * anything but a display value before this step (dashboard's CreditMeter,
 * the MCP `get_credit_balance` tool, the public `/v1/credits` endpoint) --
 * this is the first time it's actually used to BLOCK a costly action, at
 * the same single choke point STEP 9's "never render before the swipe"
 * architecture already established (apps/web/server/render-service.ts's
 * `triggerRenderForConcept`).
 */

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "unpaid" | "canceled";

/**
 * Real dunning grace: a `past_due` subscription (Stripe's own Smart
 * Retries are already attempting to collect payment) still generates for
 * a bounded window, not indefinitely and not instantly cut off on the
 * first failed charge -- an instant cutoff on the very first missed
 * payment would be a harsh, support-ticket-generating policy for what's
 * often a genuinely transient card decline.
 */
export const PAST_DUE_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export interface SubscriptionBlockInput {
  status: SubscriptionStatus;
  /** When `status` last changed (subscriptions.updatedAt) -- the grace window is measured from here, not from account creation. */
  statusSince: Date;
  now: Date;
}

export interface BlockCheckResult {
  blocked: boolean;
  reason: string | null;
}

export function isBlockedBySubscriptionStatus(input: SubscriptionBlockInput): BlockCheckResult {
  if (input.status === "canceled" || input.status === "unpaid") {
    return { blocked: true, reason: `Subscription is ${input.status} -- resolve billing to resume generating` };
  }
  if (input.status === "past_due") {
    const elapsedMs = input.now.getTime() - input.statusSince.getTime();
    if (elapsedMs > PAST_DUE_GRACE_PERIOD_MS) {
      return { blocked: true, reason: "Payment is past due and the grace period has expired -- resolve billing to resume generating" };
    }
    return { blocked: false, reason: null };
  }
  return { blocked: false, reason: null }; // active | trialing
}

export interface GenerationGateInput {
  creditBalance: number;
  requiredCredits: number;
  /** null for a workspace with no Stripe subscription at all (the free plan). */
  subscription: SubscriptionBlockInput | null;
}

export interface GenerationGateResult {
  allowed: boolean;
  reason: string | null;
}

/** Subscription-status blocks are checked before the credit balance -- a canceled/unpaid workspace is refused regardless of whatever balance it happens to still hold. */
export function checkCanGenerate(input: GenerationGateInput): GenerationGateResult {
  if (input.subscription) {
    const subscriptionCheck = isBlockedBySubscriptionStatus(input.subscription);
    if (subscriptionCheck.blocked) return { allowed: false, reason: subscriptionCheck.reason };
  }

  if (input.creditBalance < input.requiredCredits) {
    return { allowed: false, reason: `Insufficient credits: ${input.creditBalance} available, ${input.requiredCredits} required for this generation` };
  }

  return { allowed: true, reason: null };
}
