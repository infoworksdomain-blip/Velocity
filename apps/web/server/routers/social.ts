import { schema } from "@velocity/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { buildAuthorizationUrl } from "../social-service";
import { requireWorkspacePermission, router } from "../trpc";

export const socialRouter = router({
  accounts: router({
    list: requireWorkspacePermission("social_account:connect:workspace").query(async ({ ctx }) => {
      return getAdminDb().select().from(schema.socialAccounts).where(eq(schema.socialAccounts.workspaceId, ctx.workspaceId));
    }),

    disconnect: requireWorkspacePermission("social_account:disconnect:workspace")
      .input(z.object({ socialAccountId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const db = getAdminDb();
        const rows = await db.select().from(schema.socialAccounts).where(and(eq(schema.socialAccounts.id, input.socialAccountId), eq(schema.socialAccounts.workspaceId, ctx.workspaceId))).limit(1);
        if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
        // Delete the credential outright, not just mark it inactive — a disconnected account should have NO token sitting in the database (threat model, item 2: platform_credentials is "the only place an OAuth token exists").
        await db.delete(schema.platformCredentials).where(eq(schema.platformCredentials.socialAccountId, input.socialAccountId));
        await db.update(schema.socialAccounts).set({ connectionStatus: "disconnected" }).where(eq(schema.socialAccounts.id, input.socialAccountId));
        return { ok: true };
      }),
  }),

  oauth: router({
    /** Returns the real authorization URL to redirect the browser to — the callback (app/api/oauth/[platform]/callback, a real Next.js route handler, not tRPC, since the platform redirects the USER'S BROWSER there with ?code=&state=) completes the connection. */
    authorizationUrl: requireWorkspacePermission("social_account:connect:workspace")
      .input(z.object({ platform: z.enum(["tiktok", "instagram", "youtube"]) }))
      .mutation(async ({ ctx, input }) => {
        const url = await buildAuthorizationUrl(input.platform, ctx.workspaceId, ctx.user.id);
        return { url };
      }),
  }),

  quota: router({
    list: requireWorkspacePermission("social_account:connect:workspace").query(async ({ ctx }) => {
      return getAdminDb()
        .select({ quota: schema.platformQuotaState, platform: schema.socialAccounts.platform, handle: schema.socialAccounts.handle })
        .from(schema.platformQuotaState)
        .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.platformQuotaState.socialAccountId))
        .where(eq(schema.platformQuotaState.workspaceId, ctx.workspaceId));
    }),
  }),
});
