import { rbac } from "@velocity/core";
import { schema } from "@velocity/db";
import { TRPCError, initTRPC } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { getAdminDb } from "./db";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/**
 * Every procedure that touches a user's own identity or anything
 * requiring sign-in goes through this. It does not check any specific
 * permission — see requirePlatformPermission below for that, per STEP 3's
 * "one central policy module" rule (no ad-hoc role checks in procedures).
 */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.sessionId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user, sessionId: ctx.sessionId } });
});

/** Gates a procedure behind a platform-scoped permission (packages/core's PERMISSION_CATALOG). */
export function requirePlatformPermission(permission: rbac.Permission) {
  return protectedProcedure.use(({ ctx, next }) => {
    const roleKey = ctx.user.platformRoleKey;
    if (!roleKey || !rbac.can(roleKey as rbac.RoleKey, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing platform permission: ${permission}`,
      });
    }
    return next({ ctx });
  });
}

/**
 * Resolves the caller's role within the `x-workspace-id` header's
 * workspace (via `memberships`) and gates on a workspace-scoped
 * permission — the piece STEP 3 explicitly deferred to this step. Exposes
 * the resolved `workspaceId` and `workspaceRoleKey` to the procedure so it
 * never has to re-derive them.
 */
export function requireWorkspacePermission(permission: rbac.Permission) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const workspaceId = ctx.workspaceIdHeader;
    if (!workspaceId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "x-workspace-id header is required" });
    }

    const rows = await getAdminDb()
      .select({ roleKey: schema.roles.key })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(and(eq(schema.memberships.workspaceId, workspaceId), eq(schema.memberships.userId, ctx.user.id)))
      .limit(1);

    const roleKey = rows[0]?.roleKey;
    if (!roleKey || !rbac.can(roleKey as rbac.RoleKey, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing workspace permission: ${permission}`,
      });
    }

    return next({ ctx: { ...ctx, workspaceId, workspaceRoleKey: roleKey as rbac.RoleKey } });
  });
}
