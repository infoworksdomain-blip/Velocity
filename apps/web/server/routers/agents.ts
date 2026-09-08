import { z } from "zod";
import { getAdminDb } from "../db";
import { killAgentRun, listAgentRuns, startAgentRun } from "../agent-service";
import { requireWorkspacePermission, router } from "../trpc";

const PERMISSION = "content:create:workspace";

/**
 * Goal-directed AI Agent runs (STEP 16). `start` runs synchronously within
 * the mutation (the same shape as growthBrain.assistant.chat) — a real,
 * contained scope trim: a durable background job queue for long-running
 * agent runs is a genuine follow-up, not built here (see docs/steps/
 * STEP-16.md). `kill` writes a status the run's own `isKilled()` hook
 * re-reads fresh before every tool call, so it can take effect mid-run
 * from a separate request even though this build has no background
 * worker actually running these loops yet.
 */
export const agentsRouter = router({
  runs: router({
    list: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => listAgentRuns(ctx.workspaceId, getAdminDb())),

    start: requireWorkspacePermission(PERMISSION)
      .input(z.object({ goal: z.string().min(1).max(2000), spendCapUsd: z.number().positive().max(10000) }))
      .mutation(async ({ ctx, input }) => startAgentRun({ workspaceId: ctx.workspaceId, userId: ctx.user.id, goal: input.goal, spendCapUsd: input.spendCapUsd }, getAdminDb())),

    kill: requireWorkspacePermission(PERMISSION)
      .input(z.object({ agentRunId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await killAgentRun(ctx.workspaceId, input.agentRunId, getAdminDb());
        return { killed: true };
      }),
  }),
});
