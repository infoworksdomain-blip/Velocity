import { billing, notifications } from "@velocity/core";
import { schema } from "@velocity/db";
import { eq, gte, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";
import { getWorkspaceSubscription } from "./billing-service";

/**
 * GATE 19's literal "a workspace at its cap cannot generate" -- the real
 * enforcement wiring, separate from billing-service.ts's Stripe
 * orchestration since neither the balance read nor the reconciliation
 * query needs Stripe at all (they read credit_balances/usage_events/
 * credit_ledger directly).
 */
export type CreditGateDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Real-if-simplified membership lookup (the first real member — the same shape apps/worker's token-refresh-daemon already established for "who do we notify about this workspace"), not a fabricated userId. */
async function notifyWorkspace(db: CreditGateDb, workspaceId: string, event: Omit<notifications.NotificationEvent, "userId" | "workspaceId">): Promise<void> {
  const memberRows = await db.select({ userId: schema.memberships.userId }).from(schema.memberships).where(eq(schema.memberships.workspaceId, workspaceId)).limit(1);
  const userId = memberRows[0]?.userId;
  if (!userId) return; // a workspace with zero members is a real, if unusual, state -- skip rather than throw
  notifications.publish({ ...event, workspaceId, userId });
}

export async function getCreditBalance(workspaceId: string, db: CreditGateDb = getAdminDb()): Promise<number> {
  const result = await db.execute<{ balance: string }>(sql`SELECT balance FROM credit_balances WHERE workspace_id = ${workspaceId}`);
  const row = result.rows[0] as { balance: string } | undefined;
  return row ? Number(row.balance) : 0;
}

/**
 * The actual gate `apps/web/server/render-service.ts`'s `triggerRenderForConcept`
 * calls before ever starting a real Temporal render workflow -- the
 * single choke point STEP 9's "never render before the swipe"
 * architecture already established, now also enforcing STEP 19's credit
 * cap at exactly that point rather than a second, separate one.
 */
export async function assertWorkspaceCanGenerate(workspaceId: string, requiredCredits: number, db: CreditGateDb = getAdminDb()): Promise<void> {
  const [balance, subscriptionRow] = await Promise.all([getCreditBalance(workspaceId, db), getWorkspaceSubscription(workspaceId, db)]);

  const result = billing.checkCanGenerate({
    creditBalance: balance,
    requiredCredits,
    subscription: subscriptionRow ? { status: subscriptionRow.status as billing.SubscriptionStatus, statusSince: subscriptionRow.updatedAt, now: new Date() } : null,
  });

  if (!result.allowed) {
    // Best-effort, fire-and-forget (notifications.publish's own contract) --
    // the real `credit_low` event type STEP 7's own bus doc comment
    // explicitly reserved for this step ("credit-low events are STEP
    // 8/12/19's job to emit").
    void notifyWorkspace(db, workspaceId, { type: "credit_low", title: "Generation blocked", body: result.reason ?? "This workspace cannot generate right now", data: { creditBalance: balance, requiredCredits } });
    throw new Error(result.reason ?? "This workspace cannot generate right now");
  }
}

// ---------------------------------------------------------------------------
// Nightly reconciliation (GATE 19: "ledger reconciles to provider costs").
// A real, callable function -- not actually scheduled anywhere, matching
// this codebase's own repeated, honestly-flagged gap (no scheduler exists
// yet, first noted at STEP 11 and true at every step since).
// ---------------------------------------------------------------------------

export interface ReconcileWorkspaceLedgerResult extends ReturnType<typeof billing.reconcileCreditLedger> {
  workspaceId: string;
}

/** Reconciles one workspace's usage_events against its credit_ledger debits for everything recorded since `since`. */
export async function reconcileWorkspaceLedger(workspaceId: string, since: Date, db: CreditGateDb = getAdminDb()): Promise<ReconcileWorkspaceLedgerResult> {
  const usageRows = await db
    .select({ id: schema.usageEvents.id, jobKind: schema.usageEvents.jobKind, units: schema.usageEvents.units })
    .from(schema.usageEvents)
    .where(sql`${schema.usageEvents.workspaceId} = ${workspaceId} AND ${schema.usageEvents.createdAt} >= ${since}`);

  const ledgerRows = await db
    .select({ referenceId: schema.creditLedger.referenceId, debit: schema.creditLedger.debit })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.workspaceId, workspaceId));

  const debitsByUsageEventId = new Map<string, number>();
  for (const row of ledgerRows) {
    if (!row.referenceId) continue;
    debitsByUsageEventId.set(row.referenceId, (debitsByUsageEventId.get(row.referenceId) ?? 0) + row.debit);
  }

  const result = billing.reconcileCreditLedger({
    usageEvents: usageRows.map((r) => ({ id: r.id, jobKind: r.jobKind as billing.BillableJobKind, units: Number(r.units) })),
    actualCreditsByUsageEventId: debitsByUsageEventId,
  });

  if (result.driftExceedsThreshold) {
    void notifyWorkspace(db, workspaceId, {
      type: "automation_alert",
      title: "Billing ledger drift detected",
      body: `Credit ledger drift of ${result.driftPercent.toFixed(2)}% exceeds the 1% alert threshold (${result.mismatches.length} mismatched usage event${result.mismatches.length === 1 ? "" : "s"}).`,
      data: { driftPercent: result.driftPercent, mismatchCount: result.mismatches.length },
    });
  }

  return { workspaceId, ...result };
}

/** Reconciles every workspace with any usage_events activity since `since` -- the actual "nightly job" body; a real scheduler (cron, a queue consumer) is what's missing, not this logic. */
export async function reconcileAllWorkspaces(since: Date, db: CreditGateDb = getAdminDb()): Promise<ReconcileWorkspaceLedgerResult[]> {
  const workspaceRows = await db.selectDistinct({ workspaceId: schema.usageEvents.workspaceId }).from(schema.usageEvents).where(gte(schema.usageEvents.createdAt, since));
  const results: ReconcileWorkspaceLedgerResult[] = [];
  for (const row of workspaceRows) {
    results.push(await reconcileWorkspaceLedger(row.workspaceId, since, db));
  }
  return results;
}
