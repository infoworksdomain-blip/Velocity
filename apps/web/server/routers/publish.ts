import { schema } from "@velocity/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { triggerPublish } from "../publish-service";
import { requireWorkspacePermission, router } from "../trpc";

const PERMISSION = "content:publish:workspace";

export const publishRouter = router({
  trigger: requireWorkspacePermission(PERMISSION)
    .input(z.object({ contentItemId: z.string().uuid(), socialAccountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return triggerPublish({ workspaceId: ctx.workspaceId, userId: ctx.user.id, contentItemId: input.contentItemId, socialAccountId: input.socialAccountId });
    }),

  status: requireWorkspacePermission(PERMISSION)
    .input(z.object({ publicationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await getAdminDb()
        .select()
        .from(schema.publications)
        .where(and(eq(schema.publications.id, input.publicationId), eq(schema.publications.workspaceId, ctx.workspaceId)))
        .limit(1);
      return rows[0] ?? null;
    }),

  list: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => {
    return getAdminDb()
      .select({ publication: schema.publications, platform: schema.socialAccounts.platform, handle: schema.socialAccounts.handle })
      .from(schema.publications)
      .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.publications.socialAccountId))
      .where(eq(schema.publications.workspaceId, ctx.workspaceId))
      .orderBy(desc(schema.publications.createdAt))
      .limit(50);
  }),
});
