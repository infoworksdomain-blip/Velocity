import { randomUUID } from "node:crypto";
import { agents, audit, growthBrain } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import { getAdminDb } from "./db";
import { executeGrowthBrainTool, getAssistantProvider, type AssistantDb } from "./assistant-service";

const { runAgentToGoal } = agents;
const { GROWTH_BRAIN_TOOLS } = growthBrain;
const { writeAuditLog } = audit;

/**
 * Wires STEP 16's `runAgentToGoal` (packages/core/src/agents) to real,
 * persisted state — `agent_runs`/`agent_run_steps` (both already existed
 * in the schema since STEP 1's upfront domain design, unused until now).
 * Reuses STEP 14's exact `GROWTH_BRAIN_TOOLS`/`executeGrowthBrainTool`
 * unchanged: an agent run gets the SAME tool set as the chat assistant
 * (create/preview/read only, no publish path — see run-agent.ts's own
 * doc comment on why this makes C7 hold by construction) and the SAME
 * workspace-isolation guarantee GATE 14 already proved for that tool set.
 */

export interface StartAgentRunInput {
  workspaceId: string;
  userId: string;
  goal: string;
  spendCapUsd: number;
}

export interface StartAgentRunResult {
  agentRunId: string;
  status: string;
  reply: string;
  totalCostUsd: number;
}

export async function startAgentRun(input: StartAgentRunInput, db: AssistantDb = getAdminDb()): Promise<StartAgentRunResult> {
  const agentRunId = randomUUID();
  await db.insert(schema.agentRuns).values({ id: agentRunId, workspaceId: input.workspaceId, goal: input.goal, spendCapUsd: input.spendCapUsd.toString(), spendUsd: "0", status: "running", stepTrace: [] });

  const executeTool = async (name: string, toolInput: unknown): Promise<{ content: string; isError?: boolean }> => {
    try {
      const output = await executeGrowthBrainTool(input.workspaceId, name, toolInput, db);
      await writeAuditLog(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: `agent.tool_call.${name}`, targetType: "agent_run", targetId: agentRunId, before: toolInput as object, after: output as object });
      return { content: JSON.stringify(output) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeAuditLog(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: `agent.tool_call.${name}.failed`, targetType: "agent_run", targetId: agentRunId, before: toolInput as object, after: { error: message } });
      return { content: message, isError: true };
    }
  };

  const isKilled = async (): Promise<boolean> => {
    const rows = await db.select({ status: schema.agentRuns.status }).from(schema.agentRuns).where(eq(schema.agentRuns.id, agentRunId)).limit(1);
    return rows[0]?.status === "killed";
  };

  const result = await runAgentToGoal({
    provider: getAssistantProvider(),
    goal: input.goal,
    tools: GROWTH_BRAIN_TOOLS,
    executeTool,
    spendCapUsd: input.spendCapUsd,
    hooks: { isKilled },
  });

  // A run already marked "killed" mid-flight (by a concurrent kill request) keeps that status regardless of what the loop itself concluded — the user's kill request is authoritative.
  const existingRows = await db.select({ status: schema.agentRuns.status }).from(schema.agentRuns).where(eq(schema.agentRuns.id, agentRunId)).limit(1);
  const finalStatus = existingRows[0]?.status === "killed" ? "killed" : result.status;

  await db
    .update(schema.agentRuns)
    .set({ status: finalStatus, spendUsd: result.totalCostUsd.toFixed(2), stepTrace: result.stepTrace as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(schema.agentRuns.id, agentRunId));

  return { agentRunId, status: finalStatus, reply: result.reply, totalCostUsd: result.totalCostUsd };
}

export async function killAgentRun(workspaceId: string, agentRunId: string, db: AssistantDb = getAdminDb()): Promise<void> {
  const result = await db
    .update(schema.agentRuns)
    .set({ status: "killed", updatedAt: new Date() })
    .where(and(eq(schema.agentRuns.id, agentRunId), eq(schema.agentRuns.workspaceId, workspaceId)))
    .returning({ id: schema.agentRuns.id });
  if (result.length === 0) throw new Error(`Agent run ${agentRunId} not found in workspace ${workspaceId}`);
}

export async function listAgentRuns(workspaceId: string, db: AssistantDb = getAdminDb()) {
  return db.select().from(schema.agentRuns).where(eq(schema.agentRuns.workspaceId, workspaceId));
}
