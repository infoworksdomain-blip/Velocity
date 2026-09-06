import { schema } from "@velocity/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { ensureNotificationPersistence } from "../notifications-bootstrap";
import { requireWorkspacePermission, router } from "../trpc";

ensureNotificationPersistence();

const NOTIFICATION_LIST_LIMIT = 50;

/**
 * Read access reuses workspace:read:workspace rather than a new
 * notifications:read:workspace permission — no role in the STEP 3 RBAC
 * catalog needs to see notifications without also being able to read the
 * workspace itself, so a dedicated permission would be a distinction
 * without a difference right now.
 */
export const notificationsRouter = router({
  list: requireWorkspacePermission("workspace:read:workspace").query(async ({ ctx }) => {
    return getAdminDb()
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.workspaceId, ctx.workspaceId), eq(schema.notifications.userId, ctx.user.id)))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(NOTIFICATION_LIST_LIMIT);
  }),

  markRead: requireWorkspacePermission("workspace:read:workspace")
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await getAdminDb()
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(schema.notifications.id, input.notificationId),
            eq(schema.notifications.workspaceId, ctx.workspaceId),
            eq(schema.notifications.userId, ctx.user.id),
          ),
        );
      return { ok: true };
    }),

  preferences: router({
    get: requireWorkspacePermission("workspace:read:workspace").query(async ({ ctx }) => {
      const rows = await getAdminDb()
        .select({ preferences: schema.notificationPreferences.preferences })
        .from(schema.notificationPreferences)
        .where(
          and(
            eq(schema.notificationPreferences.workspaceId, ctx.workspaceId),
            eq(schema.notificationPreferences.userId, ctx.user.id),
          ),
        )
        .limit(1);
      // Missing key = enabled by default — a fresh workspace has no row yet
      // and every notification type should be on until the user opts out.
      return rows[0]?.preferences ?? {};
    }),

    update: requireWorkspacePermission("workspace:read:workspace")
      .input(z.object({ preferences: z.record(z.string(), z.boolean()) }))
      .mutation(async ({ ctx, input }) => {
        await getAdminDb()
          .insert(schema.notificationPreferences)
          .values({ workspaceId: ctx.workspaceId, userId: ctx.user.id, preferences: input.preferences })
          .onConflictDoUpdate({
            target: [schema.notificationPreferences.workspaceId, schema.notificationPreferences.userId],
            set: { preferences: input.preferences, updatedAt: new Date() },
          });
        return { ok: true };
      }),
  }),
});
