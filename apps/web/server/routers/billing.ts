import { billing } from "@velocity/core";
import { schema } from "@velocity/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createBillingPortalSession, createSubscriptionCheckoutSession, createTopUpCheckoutSession, getWorkspaceSubscription } from "../billing-service";
import { getCreditBalance } from "../credit-gate-service";
import { getAdminDb } from "../db";
import { requireWorkspacePermission, router } from "../trpc";

const BILLING_READ = "billing:read:workspace";
const BILLING_MANAGE = "billing:manage:workspace";

export const billingRouter = router({
  /** The real, authoritative plan catalogue (STEP 19) — replaces the provisional PLAN_SEAT_LIMITS/PLAN_CREDIT_LIMITS as the pricing source of truth for anything customer-facing. */
  plans: requireWorkspacePermission(BILLING_READ).query(() => Object.values(billing.BILLING_PLANS)),

  currentSubscription: requireWorkspacePermission(BILLING_READ).query(({ ctx }) => getWorkspaceSubscription(ctx.workspaceId, getAdminDb())),

  creditBalance: requireWorkspacePermission(BILLING_READ).query(({ ctx }) => getCreditBalance(ctx.workspaceId, getAdminDb())),

  invoices: requireWorkspacePermission(BILLING_READ).query(async ({ ctx }) => {
    return getAdminDb().select().from(schema.invoices).where(eq(schema.invoices.workspaceId, ctx.workspaceId)).orderBy(desc(schema.invoices.issuedAt)).limit(50);
  }),

  checkout: router({
    subscription: requireWorkspacePermission(BILLING_MANAGE)
      .input(z.object({ planKey: z.enum(["starter", "growth", "pro"]), successUrl: z.string().url(), cancelUrl: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        const [workspaceRow] = await getAdminDb().select({ name: schema.workspaces.name }).from(schema.workspaces).where(eq(schema.workspaces.id, ctx.workspaceId)).limit(1);
        return createSubscriptionCheckoutSession({ workspaceId: ctx.workspaceId, workspaceName: workspaceRow?.name ?? ctx.workspaceId, planKey: input.planKey, successUrl: input.successUrl, cancelUrl: input.cancelUrl }, getAdminDb());
      }),

    topUp: requireWorkspacePermission(BILLING_MANAGE)
      .input(z.object({ packKey: z.enum(["small", "medium", "large"]), successUrl: z.string().url(), cancelUrl: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        const [workspaceRow] = await getAdminDb().select({ name: schema.workspaces.name }).from(schema.workspaces).where(eq(schema.workspaces.id, ctx.workspaceId)).limit(1);
        return createTopUpCheckoutSession({ workspaceId: ctx.workspaceId, workspaceName: workspaceRow?.name ?? ctx.workspaceId, packKey: input.packKey, successUrl: input.successUrl, cancelUrl: input.cancelUrl }, getAdminDb());
      }),
  }),

  /** The real Stripe Billing Portal — upgrade/downgrade/cancel/payment-method-update all happen inside Stripe's own hosted UI (billing-service.ts's own doc comment explains why). */
  portalSession: requireWorkspacePermission(BILLING_MANAGE).input(z.object({ returnUrl: z.string().url() })).mutation(({ ctx, input }) => createBillingPortalSession(ctx.workspaceId, input.returnUrl, getAdminDb())),
});
