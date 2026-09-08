import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import {
  acceptEngagement,
  approveEngagement,
  cancelEngagement,
  checkClientBudget,
  confirmPaidPartnershipDisclosure,
  createCreator,
  createEngagement,
  createPartner,
  deliverEngagement,
  fundEngagementEscrow,
  linkPartnerClient,
  listCreators,
  listEngagements,
  listManagedWorkspaces,
  payEngagement,
  rejectEngagement,
  resolveBrandingForHost,
  setWhiteLabelConfig,
} from "../agency-service";
import { protectedProcedure, publicProcedure, requireWorkspacePermission, router } from "../trpc";

const AGENCY_PERMISSION = "agency:manage_clients:workspace";
const CREATE = "content:create:workspace";
const APPROVE = "content:approve:workspace";

/** A caller may manage a partner's white-label config only if they hold a real agency_manager membership in at least one workspace already linked to that partner — there is no separate "partner staff" membership model in this pass (a real, documented scope trim; see docs/steps/STEP-17.md). */
async function assertUserManagesPartner(userId: string, partnerId: string): Promise<void> {
  const db = getAdminDb();
  const rows = await db
    .select({ workspaceId: schema.partnerClients.workspaceId })
    .from(schema.partnerClients)
    .innerJoin(schema.memberships, eq(schema.memberships.workspaceId, schema.partnerClients.workspaceId))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(and(eq(schema.partnerClients.partnerId, partnerId), eq(schema.memberships.userId, userId), eq(schema.roles.key, "agency_manager")))
    .limit(1);
  if (rows.length === 0) throw new Error(`You do not manage any client workspace linked to partner ${partnerId}`);
}

export const agencyRouter = router({
  /** Agency Mode's console (build script module 26) — every workspace where the caller holds the real agency_manager role, no new authorization mechanism. */
  managedWorkspaces: protectedProcedure.query(({ ctx }) => listManagedWorkspaces(ctx.user.id, getAdminDb())),

  partners: router({
    create: protectedProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ input }) => createPartner(input.name, getAdminDb())),
  }),

  clients: router({
    link: requireWorkspacePermission(AGENCY_PERMISSION)
      .input(z.object({ partnerId: z.string().uuid(), budgetCapUsd: z.number().positive().nullable().optional(), marginPercent: z.number().min(0).max(100).optional() }))
      .mutation(({ ctx, input }) => linkPartnerClient({ partnerId: input.partnerId, workspaceId: ctx.workspaceId, budgetCapUsd: input.budgetCapUsd, marginPercent: input.marginPercent }, getAdminDb())),

    checkBudget: requireWorkspacePermission(AGENCY_PERMISSION).query(({ ctx }) => checkClientBudget(ctx.workspaceId, getAdminDb())),
  }),

  whiteLabel: router({
    set: protectedProcedure
      .input(z.object({ partnerId: z.string().uuid(), customDomain: z.string().min(1).optional(), logoStorageKey: z.string().optional(), palette: z.record(z.string(), z.string()).optional(), emailSenderDomain: z.string().optional(), removeBranding: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertUserManagesPartner(ctx.user.id, input.partnerId);
        return setWhiteLabelConfig(input, getAdminDb());
      }),

    /** Public — resolving branding for an incoming domain must work before the visitor has authenticated at all. */
    resolveForHost: publicProcedure.input(z.object({ host: z.string().min(1) })).query(({ input }) => resolveBrandingForHost(input.host, getAdminDb())),
  }),

  creators: router({
    list: protectedProcedure.query(() => listCreators(getAdminDb())),
    create: protectedProcedure.input(z.object({ displayName: z.string().min(1), email: z.string().email(), rateUsd: z.number().positive().optional() })).mutation(({ input }) => createCreator(input, getAdminDb())),
  }),

  engagements: router({
    list: requireWorkspacePermission(CREATE).query(({ ctx }) => listEngagements(ctx.workspaceId, getAdminDb())),

    create: requireWorkspacePermission(CREATE)
      .input(z.object({ creatorId: z.string().uuid(), briefText: z.string().min(1), rateUsd: z.number().positive() }))
      .mutation(({ ctx, input }) => createEngagement({ workspaceId: ctx.workspaceId, ...input }, getAdminDb())),

    accept: requireWorkspacePermission(CREATE)
      .input(z.object({ engagementId: z.string().uuid(), fundAmountUsd: z.number().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = getAdminDb();
        await acceptEngagement(ctx.workspaceId, input.engagementId, db);
        await fundEngagementEscrow(ctx.workspaceId, input.engagementId, input.fundAmountUsd, db);
        return { accepted: true };
      }),

    deliver: requireWorkspacePermission(CREATE)
      .input(z.object({ engagementId: z.string().uuid(), deliverableStorageKey: z.string().min(1) }))
      .mutation(({ ctx, input }) => deliverEngagement(ctx.workspaceId, input.engagementId, input.deliverableStorageKey, getAdminDb()).then(() => ({ delivered: true }))),

    reject: requireWorkspacePermission(APPROVE)
      .input(z.object({ engagementId: z.string().uuid() }))
      .mutation(({ ctx, input }) => rejectEngagement(ctx.workspaceId, input.engagementId, getAdminDb()).then(() => ({ rejected: true }))),

    cancel: requireWorkspacePermission(CREATE)
      .input(z.object({ engagementId: z.string().uuid() }))
      .mutation(({ ctx, input }) => cancelEngagement(ctx.workspaceId, input.engagementId, getAdminDb()).then(() => ({ cancelled: true }))),

    confirmPaidPartnershipDisclosure: requireWorkspacePermission(APPROVE)
      .input(z.object({ engagementId: z.string().uuid() }))
      .mutation(({ ctx, input }) => confirmPaidPartnershipDisclosure({ workspaceId: ctx.workspaceId, engagementId: input.engagementId }, getAdminDb()).then(() => ({ confirmed: true }))),

    /** C7-equivalent for the marketplace: approval requires the workspace's own explicit action, gated on the paid-partnership disclosure being confirmed first (enforced in agency-service.ts, not just in this router). */
    approve: requireWorkspacePermission(APPROVE)
      .input(z.object({ engagementId: z.string().uuid() }))
      .mutation(({ ctx, input }) => approveEngagement(ctx.workspaceId, input.engagementId, getAdminDb()).then(() => ({ approved: true }))),

    pay: requireWorkspacePermission(APPROVE)
      .input(z.object({ engagementId: z.string().uuid() }))
      .mutation(({ ctx, input }) => payEngagement(ctx.workspaceId, input.engagementId, getAdminDb()).then(() => ({ paid: true }))),
  }),
});
