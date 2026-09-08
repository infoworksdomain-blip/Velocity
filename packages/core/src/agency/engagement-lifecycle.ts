/**
 * The Creator Marketplace engagement state machine (STEP 17, build
 * script module 29: "receive briefs, deliver, get paid... per-engagement
 * contract... escrow... paid-partnership disclosure"). Pure — no DB
 * access — the same "logic separate from I/O" split as calendar/auto-
 * fill.ts and publish/preflight.ts.
 */

export type EngagementStatus = "briefed" | "accepted" | "delivered" | "approved" | "rejected" | "paid" | "cancelled";

const VALID_TRANSITIONS: Record<EngagementStatus, EngagementStatus[]> = {
  briefed: ["accepted", "cancelled"],
  accepted: ["delivered", "cancelled"],
  // A workspace can reject a delivery and the creator re-delivers — real creative feedback loops, not a one-shot pass/fail.
  delivered: ["approved", "rejected"],
  rejected: ["delivered", "cancelled"],
  approved: ["paid"],
  paid: [],
  cancelled: [],
};

export interface TransitionCheckResult {
  allowed: boolean;
  reason: string | null;
}

export function canTransitionEngagement(from: EngagementStatus, to: EngagementStatus): TransitionCheckResult {
  if (VALID_TRANSITIONS[from].includes(to)) return { allowed: true, reason: null };
  return { allowed: false, reason: `Cannot transition an engagement from '${from}' to '${to}'` };
}

/**
 * C3/build-script requirement: a delivery cannot be approved for release
 * without the workspace having confirmed the paid-partnership disclosure
 * requirement — a real, non-bypassable gate, not a UI reminder. Payment
 * itself additionally requires `approved` status (enforced by
 * `canTransitionEngagement`), so this function is the ADDITIONAL business
 * rule layered on top of the pure state machine, mirroring how STEP 15's
 * `checkPersonaGenerationPolicy` layers real business rules on top of
 * (not instead of) its own state checks.
 */
export interface ApproveEngagementInput {
  status: EngagementStatus;
  paidPartnershipDisclosure: boolean;
}

export function canApproveEngagement(input: ApproveEngagementInput): TransitionCheckResult {
  const transitionCheck = canTransitionEngagement(input.status, "approved");
  if (!transitionCheck.allowed) return transitionCheck;
  if (!input.paidPartnershipDisclosure) {
    return { allowed: false, reason: "Cannot approve a delivery without confirming the paid-partnership disclosure requirement" };
  }
  return { allowed: true, reason: null };
}
