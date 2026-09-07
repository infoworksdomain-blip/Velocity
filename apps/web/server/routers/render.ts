import { schema } from "@velocity/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { triggerRenderForConcept } from "../render-service";
import { requireWorkspacePermission, router } from "../trpc";

export const renderRouter = router({
  start: requireWorkspacePermission("content:create:workspace")
    .input(z.object({ contentConceptId: z.string().uuid(), workspaceTier: z.string().default("free") }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await triggerRenderForConcept({
          workspaceId: ctx.workspaceId,
          userId: ctx.user.id,
          contentConceptId: input.contentConceptId,
          workspaceTier: input.workspaceTier,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }
    }),

  status: requireWorkspacePermission("content:read:workspace")
    .input(z.object({ renderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await getAdminDb()
        .select()
        .from(schema.renders)
        .where(and(eq(schema.renders.id, input.renderId), eq(schema.renders.workspaceId, ctx.workspaceId)))
        .limit(1);
      const render = rows[0];
      if (!render) throw new TRPCError({ code: "NOT_FOUND" });
      return render;
    }),

  cancel: requireWorkspacePermission("content:update:workspace")
    .input(z.object({ renderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await getAdminDb()
        .update(schema.renders)
        .set({ status: "cancelled" })
        .where(and(eq(schema.renders.id, input.renderId), eq(schema.renders.workspaceId, ctx.workspaceId)));
      return { ok: true };
    }),
});
