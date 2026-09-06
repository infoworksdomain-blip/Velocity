/**
 * Placeholder plan/seat model. STEP 19 (Billing) owns the authoritative
 * plan and pricing definitions — this exists only so STEP 4 can enforce
 * *some* seat cap on invitations without inventing STEP 19's job wholesale.
 * Treat these numbers as provisional; STEP 19 should replace this module's
 * source of truth, not just its values.
 */
export const PLAN_SEAT_LIMITS = {
  free: 1,
  starter: 3,
  growth: 10,
  pro: 25,
} as const;

export type PlanKey = keyof typeof PLAN_SEAT_LIMITS;

export function isPlanKey(value: string): value is PlanKey {
  return value in PLAN_SEAT_LIMITS;
}

export function canAddSeat(planKey: PlanKey, currentMemberCount: number): boolean {
  return currentMemberCount < PLAN_SEAT_LIMITS[planKey];
}

export function remainingSeats(planKey: PlanKey, currentMemberCount: number): number {
  return Math.max(0, PLAN_SEAT_LIMITS[planKey] - currentMemberCount);
}
