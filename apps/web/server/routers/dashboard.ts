import { plans } from "@velocity/core";
import { schema } from "@velocity/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gt, isNull, notInArray, sql, sum } from "drizzle-orm";
import { getAdminDb } from "../db";
import { requireWorkspacePermission, router } from "../trpc";

/**
 * Every field below queries a real table — there is no hardcoded stub
 * data. What's genuinely a stub, until later steps ship their producers,
 * is the *content* of those tables: content_concepts (STEP 8/9),
 * calendar_slots (STEP 10), social_accounts (STEP 11) and
 * metric_snapshots (STEP 13) are all schema-complete but unpopulated in a
 * fresh workspace, so most of these numbers are honestly zero right now
 * rather than fabricated placeholders. See docs/steps/STEP-07.md decision 4.
 */
export const dashboardRouter = router({
  get: requireWorkspacePermission("workspace:read:workspace").query(async ({ ctx }) => {
    const db = getAdminDb();
    const workspaceId = ctx.workspaceId;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      workspaceRows,
      subscriptionRows,
      creditBalanceRows,
      velocityPendingRows,
      upcomingSlotRows,
      performanceRows,
      connectedAccounts,
    ] = await Promise.all([
      db
        .select({ name: schema.workspaces.name, workspaceType: schema.workspaces.workspaceType })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, workspaceId))
        .limit(1),
      db
        .select({ planKey: schema.subscriptions.planKey })
        .from(schema.subscriptions)
        .where(and(eq(schema.subscriptions.workspaceId, workspaceId), eq(schema.subscriptions.status, "active")))
        .orderBy(desc(schema.subscriptions.createdAt))
        .limit(1),
      db.execute<{ balance: string }>(
        sql`SELECT balance FROM credit_balances WHERE workspace_id = ${workspaceId}`,
      ),
      db
        .select({ value: count() })
        .from(schema.contentConcepts)
        .where(
          and(
            eq(schema.contentConcepts.workspaceId, workspaceId),
            isNull(schema.contentConcepts.deletedAt),
            notInArray(
              schema.contentConcepts.id,
              db.select({ id: schema.velocityEvents.contentConceptId }).from(schema.velocityEvents),
            ),
          ),
        ),
      db
        .select({ value: count() })
        .from(schema.calendarSlots)
        .where(
          and(
            eq(schema.calendarSlots.workspaceId, workspaceId),
            isNull(schema.calendarSlots.deletedAt),
            gt(schema.calendarSlots.scheduledAt, new Date()),
          ),
        ),
      db
        .select({
          views: sum(schema.metricSnapshots.views),
          likes: sum(schema.metricSnapshots.likes),
          comments: sum(schema.metricSnapshots.comments),
          shares: sum(schema.metricSnapshots.shares),
        })
        .from(schema.metricSnapshots)
        .where(
          and(
            eq(schema.metricSnapshots.workspaceId, workspaceId),
            gt(schema.metricSnapshots.capturedAt, sevenDaysAgo),
          ),
        ),
      db
        .select({
          id: schema.socialAccounts.id,
          platform: schema.socialAccounts.platform,
          handle: schema.socialAccounts.handle,
          isPrivate: schema.socialAccounts.isPrivate,
        })
        .from(schema.socialAccounts)
        .where(eq(schema.socialAccounts.workspaceId, workspaceId)),
    ]);

    const workspace = workspaceRows[0];
    if (!workspace) throw new TRPCError({ code: "NOT_FOUND" });

    const planKeyRaw = subscriptionRows[0]?.planKey ?? "free";
    const planKey = plans.isPlanKey(planKeyRaw) ? planKeyRaw : "free";
    const creditLimit = plans.PLAN_CREDIT_LIMITS[planKey];

    const creditBalance = Number(creditBalanceRows.rows[0]?.balance ?? 0);
    const velocityPendingCount = velocityPendingRows[0]?.value ?? 0;
    const upcomingScheduledCount = upcomingSlotRows[0]?.value ?? 0;
    const performance = {
      views: Number(performanceRows[0]?.views ?? 0),
      likes: Number(performanceRows[0]?.likes ?? 0),
      comments: Number(performanceRows[0]?.comments ?? 0),
      shares: Number(performanceRows[0]?.shares ?? 0),
    };

    const nextBestAction = resolveNextBestAction({
      hasConnectedAccount: connectedAccounts.length > 0,
      creditBalance,
      velocityPendingCount,
      upcomingScheduledCount,
    });

    return {
      workspaceName: workspace.name,
      workspaceType: workspace.workspaceType,
      creditBalance,
      creditLimit,
      velocityPendingCount,
      upcomingScheduledCount,
      last7DaysPerformance: performance,
      connectedAccounts,
      nextBestAction,
    };
  }),
});

interface NextBestActionInput {
  hasConnectedAccount: boolean;
  creditBalance: number;
  velocityPendingCount: number;
  upcomingScheduledCount: number;
}

/**
 * A fixed priority order over genuinely observable workspace state — no
 * branch here fabricates data to justify a suggestion. The last branch is
 * reached by every fresh workspace today, since content generation
 * (STEP 8/9) doesn't exist yet to populate content_concepts.
 */
function resolveNextBestAction(input: NextBestActionInput): string {
  if (!input.hasConnectedAccount) {
    return "Connect a social account to start publishing";
  }
  if (input.creditBalance <= 0) {
    return "Add credits to your workspace to generate content";
  }
  if (input.velocityPendingCount > 0) {
    return "Swipe through your Velocity queue to approve content";
  }
  if (input.upcomingScheduledCount > 0) {
    return "You're all caught up — nothing else needs attention right now";
  }
  return "Your Velocity queue is empty — content generation ships in STEP 8";
}
