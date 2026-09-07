import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
// @velocity/worker has no "exports" restriction (like @velocity/db) —
// this reaches its compiled Temporal client directly, the same pattern
// used for @velocity/db's testing subpath. getTemporalClient() inside is
// a lazy singleton (same shape as getAdminDb()), so importing this module
// never eagerly opens a connection during Next's build-time page-data
// collection — the exact failure mode STEP 3/6 already hit with other
// eager connections.
import { startRenderWorkflow } from "@velocity/worker/dist/temporal/client.js";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { requireWorkspacePermission, router } from "../trpc";

const DEFAULT_COST_CEILING_USD = 5;

export const renderRouter = router({
  start: requireWorkspacePermission("content:create:workspace")
    .input(z.object({ contentConceptId: z.string().uuid(), workspaceTier: z.string().default("free") }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();

      const conceptRows = await db
        .select()
        .from(schema.contentConcepts)
        .where(and(eq(schema.contentConcepts.id, input.contentConceptId), eq(schema.contentConcepts.workspaceId, ctx.workspaceId)))
        .limit(1);
      const concept = conceptRows[0];
      if (!concept) throw new TRPCError({ code: "NOT_FOUND", message: "Content concept not found" });

      const storyboardRows = await db
        .select()
        .from(schema.storyboards)
        .where(eq(schema.storyboards.contentConceptId, concept.id))
        .limit(1);
      const storyboard = storyboardRows[0];
      if (!storyboard) throw new TRPCError({ code: "BAD_REQUEST", message: "Concept has no storyboard" });

      // content_items.textPlanId is NOT NULL — a concept generated via
      // STEP 8's stub text provider (pending STEP 8B's real adapters) may
      // have no real text plan yet. A minimal placeholder satisfies the
      // constraint; STEP 8B's landing removes the need for this branch
      // entirely once concept generation always produces a real plan.
      let textPlanId = concept.textPlanId;
      if (!textPlanId) {
        textPlanId = randomUUID();
        await db.insert(schema.textPlans).values({ id: textPlanId, workspaceId: ctx.workspaceId, version: "1.0", plan: { placeholder: true } });
      }

      // C7: human approval before publish. Triggering a render through
      // this authenticated, permission-checked endpoint IS the recorded
      // approval event for STEP 8's demo path — STEP 9's Blitz swipe-right
      // is the real product surface for this same event.
      const contentItemId = randomUUID();
      await db.insert(schema.contentItems).values({
        id: contentItemId,
        workspaceId: ctx.workspaceId,
        contentConceptId: concept.id,
        textPlanId,
        status: "queued",
        approvedByUserId: ctx.user.id,
        approvedAt: new Date(),
      });

      const renderId = randomUUID();
      const { workflowId } = await startRenderWorkflow({
        renderId,
        workspaceId: ctx.workspaceId,
        contentItemId,
        contentConceptId: concept.id,
        format: concept.format,
        storyboard: { scenes: storyboard.scenes },
        textPlanId,
        personaId: concept.personaId,
        workspaceTier: input.workspaceTier,
        costCeilingUsd: DEFAULT_COST_CEILING_USD,
        regenerationRound: 0,
      });

      return { renderId, workflowId };
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
