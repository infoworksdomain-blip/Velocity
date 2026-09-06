import { rbac } from "@velocity/core";
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
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

/**
 * Gates a procedure behind a platform-scoped permission (packages/core's
 * PERMISSION_CATALOG). Workspace-scoped permission gating needs a
 * workspace context (which workspace, and the caller's role within it) —
 * that's STEP 4's WorkspaceGuard-equivalent, not built yet, so this
 * middleware only exists for platform:: permissions in STEP 3.
 */
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
