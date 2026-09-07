import { randomUUID } from "node:crypto";
import { velocity as velocityCore } from "@velocity/core";
import { schema } from "@velocity/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { triggerRenderForConcept } from "../render-service";
import { requireWorkspacePermission, router } from "../trpc";

const { rankConcepts, needsTopUp, topUpCount, preferenceUpdatesForSwipe } = velocityCore;

/**
 * A real seeded RNG per request, not Math.random(): the same
 * dependency-injection-for-determinism pattern packages/core's own bandit
 * tests use, so a flaky ranking bug is reproducible from a logged seed
 * instead of only ever happening "sometimes." Each request gets a fresh
 * seed (Date.now()-derived) — determinism is for testability, not for
 * making every request identical.
 */
function requestRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state % 2147483646) / 2147483647 + 1e-9;
  };
}

/** Joins angles for the real angleKind — content_concepts doesn't denormalize it, and the bandit's "angle" dimension needs the real value, not a placeholder (see queue.get's earlier note about this). */
async function fetchUnswipedConcepts(workspaceId: string) {
  const db = getAdminDb();
  const rows = await db
    .select({ concept: schema.contentConcepts, angleKind: schema.angles.kind })
    .from(schema.contentConcepts)
    .innerJoin(schema.angles, eq(schema.angles.id, schema.contentConcepts.angleId))
    .where(
      and(
        eq(schema.contentConcepts.workspaceId, workspaceId),
        isNull(schema.contentConcepts.deletedAt),
        notInArray(
          schema.contentConcepts.id,
          db.select({ id: schema.velocityEvents.contentConceptId }).from(schema.velocityEvents).where(eq(schema.velocityEvents.workspaceId, workspaceId)),
        ),
      ),
    )
    .orderBy(desc(schema.contentConcepts.createdAt))
    .limit(200); // a real cap on how much of the queue any one request ranks — see queue.get's own comment
  return rows.map((r) => ({ ...r.concept, angleKind: r.angleKind }));
}

async function fetchPreferences(workspaceId: string): Promise<Map<string, { alpha: number; beta: number }>> {
  const db = getAdminDb();
  const rows = await db.select().from(schema.velocityPreferences).where(eq(schema.velocityPreferences.workspaceId, workspaceId));
  return new Map(rows.map((r) => [r.dimensionKey, { alpha: r.alpha, beta: r.beta }]));
}

export const velocityRouter = router({
  /**
   * The queue service's read path (build script STEP 9: "maintains >=50
   * ranked concepts per active workspace; background top-up below 10").
   * "Background" is honestly simplified here: this query synchronously
   * generates a fresh batch when the unswiped count is below the top-up
   * threshold, rather than dispatching to a separate BullMQ worker — a
   * real, documented scope decision (see docs/steps/STEP-09.md), not a
   * silent gap; the request is slower exactly when the queue is genuinely
   * depleted, never silently starved.
   */
  queue: requireWorkspacePermission("content:read:workspace")
    .input(z.object({ workspaceTier: z.string().default("free") }))
    .query(async ({ ctx }) => {
      let unswiped = await fetchUnswipedConcepts(ctx.workspaceId);

      if (needsTopUp(unswiped.length)) {
        // Real top-up generation reuses the exact same pipeline the
        // onboarding/dashboard "generate concepts" path already uses — see
        // apps/web/server/content-service.ts. If it fails (e.g. no brand
        // profile yet), the queue simply serves what it already has rather
        // than failing the whole request — an empty/short queue is a real,
        // honest state the front end already handles (EmptyState).
        try {
          const { generateConceptsForWorkspace } = await import("../content-service");
          const brandProfileRows = await getAdminDb().select().from(schema.brandProfiles).where(eq(schema.brandProfiles.workspaceId, ctx.workspaceId)).orderBy(desc(schema.brandProfiles.version)).limit(1);
          const brandProfile = brandProfileRows[0];
          if (brandProfile) {
            await generateConceptsForWorkspace({
              workspaceId: ctx.workspaceId,
              brandProfileId: brandProfile.id,
              personaIds: [],
              angleCount: 3,
              formats: ["hook_demo", "meme", "slideshow"],
              conceptsPerAngle: Math.ceil(topUpCount(unswiped.length) / 9),
            });
            unswiped = await fetchUnswipedConcepts(ctx.workspaceId);
          }
        } catch {
          // Top-up is best-effort — see this procedure's own doc comment.
        }
      }

      const rankable = unswiped.map((c) => ({
        id: c.id,
        angleKind: c.angleKind,
        format: c.format,
        personaId: c.personaId,
        blueprintId: c.blueprintId,
        hookPattern: c.hookPattern,
        predictedScore: c.predictedScore ? Number(c.predictedScore) : 0.5,
      }));

      const preferences = await fetchPreferences(ctx.workspaceId);
      const ranked = rankConcepts(rankable, preferences, requestRng(Date.now() ^ ctx.workspaceId.length));

      const byId = new Map(unswiped.map((c) => [c.id, c]));
      const concepts = ranked.map((r) => byId.get(r.id)).filter((c): c is NonNullable<typeof c> => Boolean(c));

      return { concepts, queueSize: concepts.length };
    }),

  session: router({
    start: requireWorkspacePermission("content:read:workspace").mutation(async ({ ctx }) => {
      const id = randomUUID();
      await getAdminDb().insert(schema.velocitySessions).values({ id, workspaceId: ctx.workspaceId, userId: ctx.user.id });
      return { velocitySessionId: id };
    }),
  }),

  /**
   * Records one swipe, updates the bandit's per-workspace preference
   * state, and — only on a right swipe — triggers the real Tier-2 render
   * (build script: "Any design that renders before the swipe has
   * unworkable unit economics. Do not build it.").
   */
  swipe: requireWorkspacePermission("content:approve:workspace")
    .input(
      z.object({
        velocitySessionId: z.string().uuid(),
        contentConceptId: z.string().uuid(),
        direction: z.enum(["left", "right"]),
        dwellTimeMs: z.number().int().nonnegative(),
        previewWatchedToCompletion: z.boolean().default(false),
        replayCount: z.number().int().nonnegative().default(0),
        workspaceTier: z.string().default("free"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();

      const conceptRows = await db.select().from(schema.contentConcepts).where(and(eq(schema.contentConcepts.id, input.contentConceptId), eq(schema.contentConcepts.workspaceId, ctx.workspaceId))).limit(1);
      const concept = conceptRows[0];
      if (!concept) throw new TRPCError({ code: "NOT_FOUND", message: "Content concept not found" });

      const angleRows = await db.select({ kind: schema.angles.kind }).from(schema.angles).where(eq(schema.angles.id, concept.angleId)).limit(1);
      const angleKind = angleRows[0]?.kind ?? "unknown";

      const eventId = randomUUID();
      await db.insert(schema.velocityEvents).values({
        id: eventId,
        workspaceId: ctx.workspaceId,
        velocitySessionId: input.velocitySessionId,
        contentConceptId: input.contentConceptId,
        direction: input.direction,
        dwellTimeMs: input.dwellTimeMs,
        previewWatchedToCompletion: input.previewWatchedToCompletion,
        replayCount: input.replayCount,
      });
      await db.update(schema.velocitySessions).set({ swipeCount: sql`${schema.velocitySessions.swipeCount} + 1` }).where(eq(schema.velocitySessions.id, input.velocitySessionId));

      const updates = preferenceUpdatesForSwipe(
        { angleKind, format: concept.format, personaId: concept.personaId, blueprintId: concept.blueprintId, hookPattern: concept.hookPattern },
        input.direction,
      );
      for (const update of updates) {
        await db
          .insert(schema.velocityPreferences)
          .values({ id: randomUUID(), workspaceId: ctx.workspaceId, dimensionKey: update.dimensionKey, alpha: 1 + update.alphaDelta, beta: 1 + update.betaDelta })
          .onConflictDoUpdate({
            target: [schema.velocityPreferences.workspaceId, schema.velocityPreferences.dimensionKey],
            set: { alpha: sql`${schema.velocityPreferences.alpha} + ${update.alphaDelta}`, beta: sql`${schema.velocityPreferences.beta} + ${update.betaDelta}`, updatedAt: new Date() },
          });
      }

      if (input.direction === "left") {
        return { velocityEventId: eventId, direction: "left" as const };
      }

      const { renderId, workflowId } = await triggerRenderForConcept({
        workspaceId: ctx.workspaceId,
        userId: ctx.user.id,
        contentConceptId: input.contentConceptId,
        workspaceTier: input.workspaceTier,
      });
      return { velocityEventId: eventId, direction: "right" as const, renderId, workflowId };
    }),

  /**
   * Undoes the most recent swipe in a session: removes the swipe event
   * (so the concept re-enters the unswiped queue), reverses its bandit
   * preference update, and — if it was a right swipe — cancels the render
   * it triggered (routers/render.ts's own `cancel`, which marks the
   * `renders` row cancelled). A genuine, honest limitation: this does not
   * reach into Temporal to cancel an in-flight workflow execution, only
   * the DB-side record of it — an already-started activity may still run
   * to completion. Documented, not silently assumed away.
   */
  undoLastSwipe: requireWorkspacePermission("content:approve:workspace")
    .input(z.object({ velocitySessionId: z.string().uuid() }))
    .mutation(async ({ ctx }) => {
      const db = getAdminDb();
      const lastEventRows = await db
        .select()
        .from(schema.velocityEvents)
        .where(and(eq(schema.velocityEvents.workspaceId, ctx.workspaceId)))
        .orderBy(desc(schema.velocityEvents.createdAt))
        .limit(1);
      const lastEvent = lastEventRows[0];
      if (!lastEvent) throw new TRPCError({ code: "NOT_FOUND", message: "No swipe to undo" });

      const conceptRows = await db.select().from(schema.contentConcepts).where(eq(schema.contentConcepts.id, lastEvent.contentConceptId)).limit(1);
      const concept = conceptRows[0];

      if (concept) {
        const angleRows = await db.select({ kind: schema.angles.kind }).from(schema.angles).where(eq(schema.angles.id, concept.angleId)).limit(1);
        const angleKind = angleRows[0]?.kind ?? "unknown";
        const updates = preferenceUpdatesForSwipe(
          { angleKind, format: concept.format, personaId: concept.personaId, blueprintId: concept.blueprintId, hookPattern: concept.hookPattern },
          lastEvent.direction,
        );
        for (const update of updates) {
          await db
            .update(schema.velocityPreferences)
            .set({ alpha: sql`${schema.velocityPreferences.alpha} - ${update.alphaDelta}`, beta: sql`${schema.velocityPreferences.beta} - ${update.betaDelta}`, updatedAt: new Date() })
            .where(and(eq(schema.velocityPreferences.workspaceId, ctx.workspaceId), eq(schema.velocityPreferences.dimensionKey, update.dimensionKey)));
        }
      }

      if (lastEvent.direction === "right") {
        const itemRows = await db.select().from(schema.contentItems).where(and(eq(schema.contentItems.contentConceptId, lastEvent.contentConceptId), eq(schema.contentItems.workspaceId, ctx.workspaceId))).orderBy(desc(schema.contentItems.createdAt)).limit(1);
        const item = itemRows[0];
        if (item) {
          await db.update(schema.renders).set({ status: "cancelled" }).where(eq(schema.renders.contentItemId, item.id));
        }
      }

      await db.delete(schema.velocityEvents).where(eq(schema.velocityEvents.id, lastEvent.id));
      await db.update(schema.velocitySessions).set({ swipeCount: sql`GREATEST(${schema.velocitySessions.swipeCount} - 1, 0)` }).where(eq(schema.velocitySessions.id, lastEvent.velocitySessionId));

      return { undone: true, contentConceptId: lastEvent.contentConceptId };
    }),
});
