import { randomUUID } from "node:crypto";
import { analytics, growthBrain } from "@velocity/core";
import { schema } from "@velocity/db";
import type { ConversationTurn } from "@velocity/text-engine";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { runGrowthBrainChat } from "../assistant-service";
import { fetchMetricSamples, getWorkspaceTimezone } from "./analytics";
import { requireWorkspacePermission, router } from "../trpc";

const { rankRecommendationsAcrossDimensions } = growthBrain;

const PERMISSION = "analytics:read:workspace";

const ConversationTurnSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string() }),
  z.object({ role: z.literal("assistant"), content: z.string().nullable(), toolCalls: z.array(z.object({ id: z.string(), name: z.string(), input: z.unknown() })) }),
  z.object({ role: z.literal("tool_result"), toolCallId: z.string(), content: z.string(), isError: z.boolean().optional() }),
]);

export const growthBrainRouter = router({
  /** STEP 14's AI Assistant. `conversation` is the full prior history plus the new user turn already appended by the client — this endpoint doesn't persist history server-side (a real, contained scope trim; see docs/steps/STEP-14.md). */
  assistant: router({
    chat: requireWorkspacePermission(PERMISSION)
      .input(z.object({ conversation: z.array(ConversationTurnSchema).min(1) }))
      .mutation(async ({ ctx, input }) => {
        // z.unknown() makes zod's inferred `input` field optional even
        // though every real toolCalls entry always carries one — normalize
        // it back to always-present here rather than loosening the shared
        // ConversationTurn type to match a zod quirk.
        const conversation: ConversationTurn[] = input.conversation.map((turn) =>
          turn.role === "assistant" ? { ...turn, toolCalls: turn.toolCalls.map((call) => ({ ...call, input: call.input ?? {} })) } : turn,
        );
        return runGrowthBrainChat({ workspaceId: ctx.workspaceId, userId: ctx.user.id, conversation });
      }),
  }),

  /** Weekly recommendations (build script: "ranked, specific recommendations... including hook-level findings"), computed live from the same real aggregation STEP 13's dashboards use. */
  recommendations: router({
    list: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => {
      const timezone = await getWorkspaceTimezone(ctx.workspaceId);
      const samples = await fetchMetricSamples(ctx.workspaceId, timezone);
      const byDimension = {
        format: analytics.aggregateByFormat(samples),
        angle: analytics.aggregateByAngle(samples),
        platform: analytics.aggregateByPlatform(samples),
        hookPattern: analytics.aggregateByHookPattern(samples),
      };
      return rankRecommendationsAcrossDimensions(byDimension);
    }),
  }),

  /** Competitor Intelligence (build script: "track named competitor public accounts, extract format/cadence/angle patterns — public data, blueprints only, C3"). See docs/steps/STEP-14.md for why only YouTube gets a real automated fetch. */
  competitors: router({
    list: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => {
      return getAdminDb()
        .select()
        .from(schema.competitors)
        .where(and(eq(schema.competitors.workspaceId, ctx.workspaceId), isNull(schema.competitors.deletedAt)))
        .orderBy(desc(schema.competitors.createdAt));
    }),

    create: requireWorkspacePermission(PERMISSION)
      .input(z.object({ platform: z.enum(["tiktok", "instagram", "youtube"]), externalRef: z.string().min(1), displayName: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const id = randomUUID();
        await getAdminDb().insert(schema.competitors).values({ id, workspaceId: ctx.workspaceId, platform: input.platform, externalRef: input.externalRef, displayName: input.displayName });
        return { competitorId: id };
      }),

    /** The real, ToS-compliant path for TikTok/Instagram — a workspace operator records what they can already see on a public profile; it feeds the exact same blueprint-extraction pipeline STEP 8.3 built for organic trend discovery. */
    ingestObservedPost: requireWorkspacePermission(PERMISSION)
      .input(
        z.object({
          competitorId: z.string().uuid(),
          captionText: z.string().min(1),
          postedAt: z.string().datetime(),
          niche: z.string().min(1),
          views: z.number().int().nonnegative().optional(),
          likes: z.number().int().nonnegative().optional(),
          comments: z.number().int().nonnegative().optional(),
          shares: z.number().int().nonnegative().optional(),
          observedRef: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = getAdminDb();
        const competitorRows = await db.select().from(schema.competitors).where(and(eq(schema.competitors.id, input.competitorId), eq(schema.competitors.workspaceId, ctx.workspaceId))).limit(1);
        const competitor = competitorRows[0];
        if (!competitor) throw new Error(`Competitor ${input.competitorId} not found in this workspace`);

        const { extractBlueprintForCompetitor } = await import("../growth-brain-service");
        return extractBlueprintForCompetitor(ctx.workspaceId, competitor.id, growthBrain.buildTrendSignalFromObservedPost({ captionText: input.captionText, postedAt: input.postedAt, niche: input.niche, views: input.views, likes: input.likes, comments: input.comments, shares: input.shares, observedRef: input.observedRef }));
      }),
  }),
});
