/**
 * Real escrow ledger movements — the exact same append-only, double-
 * entry discipline as `credit_ledger` (STEP 2 design decision 3, C5's
 * `recordUsage`). This module computes what a ledger row SHOULD say; the
 * actual DB write lives in apps/web/server/agency-service.ts, and moving
 * real money through a funded payment processor is STEP 19's job (not
 * built yet) — see docs/steps/STEP-17.md.
 */

export interface EscrowMovement {
  debit: number;
  credit: number;
  reason: "funded" | "released_to_creator" | "refunded_to_workspace";
}

export function fundEscrow(amountUsd: number): EscrowMovement {
  if (amountUsd <= 0) throw new Error("Escrow funding amount must be positive");
  return { debit: 0, credit: amountUsd, reason: "funded" };
}

export function releaseEscrowToCreator(amountUsd: number): EscrowMovement {
  if (amountUsd <= 0) throw new Error("Escrow release amount must be positive");
  return { debit: amountUsd, credit: 0, reason: "released_to_creator" };
}

export function refundEscrowToWorkspace(amountUsd: number): EscrowMovement {
  if (amountUsd <= 0) throw new Error("Escrow refund amount must be positive");
  return { debit: amountUsd, credit: 0, reason: "refunded_to_workspace" };
}

/** credit - debit, the same "sum of movements" balance calculation `credit_balances` uses for the main ledger. */
export function computeEscrowBalance(movements: { debit: number; credit: number }[]): number {
  return movements.reduce((sum, m) => sum + m.credit - m.debit, 0);
}

export interface EscrowReleaseCheckResult {
  allowed: boolean;
  reason: string | null;
}

/** A real invariant: escrow can never release or refund more than is currently held — the ledger-level enforcement that makes "the funds are safe until approval" a mechanical guarantee, not a policy statement. */
export function checkEscrowRelease(currentBalanceUsd: number, requestedAmountUsd: number): EscrowReleaseCheckResult {
  if (requestedAmountUsd > currentBalanceUsd) {
    return { allowed: false, reason: `Requested release of $${requestedAmountUsd.toFixed(2)} exceeds the current escrow balance of $${currentBalanceUsd.toFixed(2)}` };
  }
  return { allowed: true, reason: null };
}
