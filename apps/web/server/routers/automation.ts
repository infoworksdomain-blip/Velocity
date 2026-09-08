import { z } from "zod";
import { getAdminDb } from "../db";
import { createAutomation, listAutomations, runAutomation } from "../automation-service";
import { requireWorkspacePermission, router } from "../trpc";

const PERMISSION = "content:create:workspace";

const TriggerConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("schedule"), config: z.object({ timeOfDay: z.string(), daysOfWeek: z.array(z.number().int().min(0).max(6)).optional() }) }),
  z.object({ kind: z.literal("performance_threshold"), config: z.object({ dimension: z.enum(["format", "angle", "persona", "platform", "hookPattern"]), metric: z.literal("avgEngagementRate"), comparator: z.enum(["below", "above"]), threshold: z.number() }) }),
  z.object({ kind: z.literal("low_queue"), config: z.object({ minReadyCount: z.number().int().nonnegative() }) }),
  z.object({ kind: z.literal("new_blueprint_in_niche"), config: z.object({ nicheTag: z.string().min(1) }) }),
  z.object({ kind: z.literal("competitor_post"), config: z.object({ competitorId: z.string().uuid() }) }),
  z.object({ kind: z.literal("product_feed_change"), config: z.object({ feedUrl: z.string().url() }) }),
]);

const ActionConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("generate_batch"), config: z.object({ brandProfileId: z.string().uuid(), personaIds: z.array(z.string().uuid()), angleCount: z.number().int().min(1).max(20), formats: z.array(z.enum(["ai_ugc", "slideshow", "hook_demo", "meme"])), conceptsPerAngle: z.number().int().min(1).max(10) }) }),
  z.object({ kind: z.literal("auto_schedule"), config: z.object({ days: z.number().int().min(1).max(60) }) }),
  z.object({ kind: z.literal("notify"), config: z.object({ userId: z.string().uuid(), title: z.string().min(1), body: z.string().min(1) }) }),
  z.object({ kind: z.literal("pause_campaign"), config: z.object({ campaignId: z.string().uuid() }) }),
  z.object({ kind: z.literal("boost_winner_variants"), config: z.object({ winnerZScoreThreshold: z.number().optional() }) }),
  z.object({ kind: z.literal("regenerate_hooks_for_underperformers"), config: z.object({ brandProfileId: z.string().uuid(), personaIds: z.array(z.string().uuid()), loserZScoreThreshold: z.number().optional(), conceptsPerAngle: z.number().int().min(1).max(10).optional() }) }),
]);

export const automationRouter = router({
  list: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => listAutomations(ctx.workspaceId, getAdminDb())),

  create: requireWorkspacePermission(PERMISSION)
    .input(z.object({ name: z.string().min(1), trigger: TriggerConfigSchema, action: ActionConfigSchema, spendCapUsd: z.number().positive().nullable(), isDryRun: z.boolean() }))
    .mutation(async ({ ctx, input }) => createAutomation({ workspaceId: ctx.workspaceId, ...input }, getAdminDb())),

  /** Manually fires one automation immediately — the same real evaluate-then-act path apps/worker's automation-tick job runs on a schedule. */
  runNow: requireWorkspacePermission(PERMISSION)
    .input(z.object({ automationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => runAutomation(ctx.workspaceId, input.automationId, getAdminDb())),
});
