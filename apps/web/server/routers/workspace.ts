import { randomUUID } from "node:crypto";
import { plans, settings as settingsCore } from "@velocity/core";
import { schema } from "@velocity/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { protectedProcedure, requireWorkspacePermission, router } from "../trpc";
import { createWorkspaceForUser, findGlobalRoleId, sendInvitationNotification } from "../workspace-service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const workspaceRouter = router({
  /**
   * User-scoped, not workspace-scoped — deliberately not behind
   * requireWorkspacePermission, since its whole purpose is letting the
   * client discover which workspace id to put in the x-workspace-id
   * header in the first place (the WorkspaceSwitcher's data source).
   */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return getAdminDb()
      .select({
        id: schema.workspaces.id,
        name: schema.workspaces.name,
        workspaceType: schema.workspaces.workspaceType,
      })
      .from(schema.memberships)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
      .where(and(eq(schema.memberships.userId, ctx.user.id), isNull(schema.workspaces.deletedAt)));
  }),

  /** Creates a workspace, and a new organisation for it unless `organisationId` is given (the agency "add a client workspace" path). Caller becomes owner. */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        workspaceType: z.enum(["individual", "business"]),
        timezone: z.string().default("UTC"),
        organisationId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => createWorkspaceForUser(ctx.user.id, input)),

  get: requireWorkspacePermission("workspace:read:workspace").query(async ({ ctx }) => {
    const rows = await getAdminDb()
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, ctx.workspaceId))
      .limit(1);
    const workspace = rows[0];
    if (!workspace) throw new TRPCError({ code: "NOT_FOUND" });
    return workspace;
  }),

  update: requireWorkspacePermission("workspace:update:workspace")
    .input(z.object({ name: z.string().min(1).optional(), timezone: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await getAdminDb()
        .update(schema.workspaces)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schema.workspaces.id, ctx.workspaceId));
      return { ok: true };
    }),

  archive: requireWorkspacePermission("workspace:archive:workspace").mutation(async ({ ctx }) => {
    await getAdminDb()
      .update(schema.workspaces)
      .set({ deletedAt: new Date() })
      .where(eq(schema.workspaces.id, ctx.workspaceId));
    return { ok: true };
  }),

  /** Only the current owner can transfer ownership. Demotes self to admin, promotes the target to owner — never two owners, never zero. */
  transferOwnership: requireWorkspacePermission("workspace:transfer_ownership:workspace")
    .input(z.object({ newOwnerUserId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const targetMembership = await db
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.workspaceId, ctx.workspaceId), eq(schema.memberships.userId, input.newOwnerUserId)))
        .limit(1);
      if (!targetMembership[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Target user is not a member of this workspace" });
      }

      const [ownerRoleId, adminRoleId] = await Promise.all([findGlobalRoleId("owner"), findGlobalRoleId("admin")]);

      await db
        .update(schema.memberships)
        .set({ roleId: adminRoleId })
        .where(and(eq(schema.memberships.workspaceId, ctx.workspaceId), eq(schema.memberships.userId, ctx.user.id)));
      await db
        .update(schema.memberships)
        .set({ roleId: ownerRoleId })
        .where(eq(schema.memberships.id, targetMembership[0].id));

      return { ok: true };
    }),

  members: router({
    list: requireWorkspacePermission("workspace:read:workspace").query(async ({ ctx }) => {
      return getAdminDb()
        .select({
          userId: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          roleKey: schema.roles.key,
        })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
        .where(eq(schema.memberships.workspaceId, ctx.workspaceId));
    }),

    invite: requireWorkspacePermission("members:invite:workspace")
      .input(z.object({ email: z.string().email(), roleKey: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = getAdminDb();

        const [memberCount, subscriptionRows] = await Promise.all([
          db.select({ id: schema.memberships.id }).from(schema.memberships).where(eq(schema.memberships.workspaceId, ctx.workspaceId)),
          db
            .select({ planKey: schema.subscriptions.planKey })
            .from(schema.subscriptions)
            .where(and(eq(schema.subscriptions.workspaceId, ctx.workspaceId), eq(schema.subscriptions.status, "active")))
            .orderBy(desc(schema.subscriptions.createdAt))
            .limit(1),
        ]);

        const planKeyRaw = subscriptionRows[0]?.planKey ?? "free";
        const planKey = plans.isPlanKey(planKeyRaw) ? planKeyRaw : "free";
        if (!plans.canAddSeat(planKey, memberCount.length)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `The ${planKey} plan allows at most ${plans.PLAN_SEAT_LIMITS[planKey]} member(s) — upgrade to invite more`,
          });
        }

        const roleId = await findGlobalRoleId(input.roleKey);
        const invitationId = randomUUID();
        await db.insert(schema.invitations).values({
          id: invitationId,
          workspaceId: ctx.workspaceId,
          email: input.email,
          roleId,
          invitedByUserId: ctx.user.id,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        });

        // Post-STEP-22 audit remediation: this used to stop here, leaving
        // the invitee with no way to ever find out. Deliberately not
        // awaited-and-thrown-on-failure — a transient email-provider error
        // shouldn't roll back a real, already-persisted invitation the
        // workspace admin can still see and re-share manually.
        await sendInvitationNotification({ invitationId, workspaceId: ctx.workspaceId, inviteeEmail: input.email, inviterUserId: ctx.user.id }, db).catch((err) => {
          console.error("[workspace.invite] failed to send invitation notification", err);
        });

        return { invitationId };
      }),

    acceptInvitation: protectedProcedure
      .input(z.object({ invitationId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const db = getAdminDb();
        const rows = await db
          .select()
          .from(schema.invitations)
          .where(eq(schema.invitations.id, input.invitationId))
          .limit(1);
        const invitation = rows[0];

        if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation is invalid or expired" });
        }
        if (invitation.email !== ctx.user.email) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This invitation was sent to a different email" });
        }

        await db.insert(schema.memberships).values({
          id: randomUUID(),
          workspaceId: invitation.workspaceId,
          userId: ctx.user.id,
          roleId: invitation.roleId,
        });
        await db.update(schema.invitations).set({ status: "accepted" }).where(eq(schema.invitations.id, invitation.id));

        return { workspaceId: invitation.workspaceId };
      }),

    remove: requireWorkspacePermission("members:remove:workspace")
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Use transferOwnership before leaving, or ask another admin to remove you",
          });
        }
        await getAdminDb()
          .delete(schema.memberships)
          .where(and(eq(schema.memberships.workspaceId, ctx.workspaceId), eq(schema.memberships.userId, input.userId)));
        return { ok: true };
      }),
  }),

  settings: router({
    get: requireWorkspacePermission("workspace:read:workspace").query(async ({ ctx }) => {
      const db = getAdminDb();
      const rows = await db
        .select({ workspaceSettings: schema.workspaces.settings, organisationSettings: schema.organisations.settings })
        .from(schema.workspaces)
        .innerJoin(schema.organisations, eq(schema.organisations.id, schema.workspaces.organisationId))
        .where(eq(schema.workspaces.id, ctx.workspaceId))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return settingsCore.resolveAllSettings({
        workspaceSettings: row.workspaceSettings,
        organisationSettings: row.organisationSettings,
      });
    }),
  }),
});
