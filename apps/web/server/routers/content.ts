import { ContentFormatSchema } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { generateConceptsForWorkspace } from "../content-service";
import { getAdminDb } from "../db";
import { requireWorkspacePermission, router } from "../trpc";

export const contentRouter = router({
  concepts: router({
    generate: requireWorkspacePermission("content:create:workspace")
      .input(
        z.object({
          brandProfileId: z.string().uuid(),
          personaIds: z.array(z.string().uuid()).default([]),
          angleCount: z.number().int().min(1).max(20).default(5),
          formats: z.array(ContentFormatSchema).min(1),
          conceptsPerAngle: z.number().int().min(1).max(10).default(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return generateConceptsForWorkspace({
          workspaceId: ctx.workspaceId,
          brandProfileId: input.brandProfileId,
          personaIds: input.personaIds,
          angleCount: input.angleCount,
          formats: input.formats,
          conceptsPerAngle: input.conceptsPerAngle,
        });
      }),

    list: requireWorkspacePermission("content:read:workspace").query(async ({ ctx }) => {
      return getAdminDb()
        .select()
        .from(schema.contentConcepts)
        .where(and(eq(schema.contentConcepts.workspaceId, ctx.workspaceId), isNull(schema.contentConcepts.deletedAt)));
    }),

    get: requireWorkspacePermission("content:read:workspace")
      .input(z.object({ conceptId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const rows = await getAdminDb()
          .select()
          .from(schema.contentConcepts)
          .where(and(eq(schema.contentConcepts.id, input.conceptId), eq(schema.contentConcepts.workspaceId, ctx.workspaceId)))
          .limit(1);
        return rows[0] ?? null;
      }),
  }),

  storyboard: router({
    get: requireWorkspacePermission("content:read:workspace")
      .input(z.object({ conceptId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const rows = await getAdminDb()
          .select()
          .from(schema.storyboards)
          .where(and(eq(schema.storyboards.contentConceptId, input.conceptId), eq(schema.storyboards.workspaceId, ctx.workspaceId)))
          .limit(1);
        return rows[0] ?? null;
      }),
  }),
});
