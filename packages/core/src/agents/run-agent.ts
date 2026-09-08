import type { AssistantProvider, AssistantTool } from "@velocity/text-engine";
import { checkSpendCap } from "../automation/spend-cap.js";
import { runAssistantConversation, type ToolExecutor } from "../growth-brain/run-assistant-conversation.js";

/**
 * Goal-directed AI Agent runs (STEP 16, build script: "goal-directed runs
 * (\"keep my calendar full for 30 days within 400 credits\"). Hard spend
 * ceiling, approval gates (C7), full step trace, kill switch."). Built as
 * a thin wrapper around STEP 14's real `runAssistantConversation` — NOT a
 * new orchestration loop — by wrapping the caller-supplied `executeTool`
 * with three checks run before every real tool call: a kill switch
 * (re-read fresh from the caller's `hooks.isKilled()` before EVERY call,
 * not cached — a genuine kill switch, not a flag read once at start), a
 * hard spend ceiling (`checkSpendCap`, the same pure function STEP 16's
 * Automation Engine uses for its own per-automation cap), and a full step
 * trace (every attempted call is recorded, including ones refused for a
 * kill or a cap — the trace is a record of what was ATTEMPTED, not just
 * what succeeded).
 *
 * C7 (human approval before publish) is enforced here BY CONSTRUCTION, not
 * by a per-call approval prompt: the tool set an agent run is given
 * (GROWTH_BRAIN_TOOLS, reused unchanged from STEP 14) contains no tool
 * that can autonomously publish to a real audience — `create_content_
 * concepts` only drafts, `schedule_content` only previews, `pull_
 * analytics` only reads. There is no reachable path from a goal-directed
 * run to a real publish. A future tool that COULD publish would need an
 * explicit approval-gate check inserted at that call site, the same way
 * this file inserts the spend/kill checks — flagged here as the honest
 * limit of what "approval gates" means for the tool surface that
 * currently exists.
 *
 * Honest limitation on spend accounting (see docs/steps/STEP-16.md):
 * `runAssistantConversation`'s own `totalCostUsd` (the real LLM
 * orchestration cost) is always included. A tool's OWN generation cost
 * (e.g. `create_content_concepts`'s real `costUsd` from
 * `generateConceptsForWorkspace`) is additionally picked up here by
 * parsing it out of that tool's own JSON result when present — real data
 * already flowing through the pipe, not fabricated — but this is a
 * best-effort accounting, not a change to `ToolExecutor`'s own contract
 * (which STEP 14 already established and this step doesn't want to
 * destabilize). A tool whose result carries no numeric `costUsd` field
 * contributes 0 to the tracked spend even if it has a real, separately
 * C5-metered cost recorded via `usage_events` elsewhere.
 */

export type AgentRunStatus = "running" | "completed" | "killed" | "spend_cap_reached";

export interface AgentStepTraceEntry {
  toolName: string;
  toolInput: unknown;
  outputSummary: string;
  isError: boolean;
  costUsd: number;
}

export interface AgentRunHooks {
  /** Re-read fresh before every tool call — a genuine kill switch, not an in-memory flag captured once at start. */
  isKilled: () => Promise<boolean>;
}

export interface RunAgentToGoalInput {
  provider: AssistantProvider;
  goal: string;
  tools: AssistantTool[];
  executeTool: ToolExecutor;
  spendCapUsd: number;
  hooks: AgentRunHooks;
  maxToolRounds?: number;
}

export interface RunAgentToGoalResult {
  reply: string;
  status: AgentRunStatus;
  stepTrace: AgentStepTraceEntry[];
  totalCostUsd: number;
}

const DEFAULT_MAX_TOOL_ROUNDS = 10;

function extractCostUsd(content: string): number {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === "object" && "costUsd" in parsed && typeof (parsed as { costUsd: unknown }).costUsd === "number") {
      return (parsed as { costUsd: number }).costUsd;
    }
  } catch {
    // Not JSON, or no costUsd field — most tool results (a schedule preview, an analytics read) carry no direct spend, and 0 is the correct contribution here.
  }
  return 0;
}

export async function runAgentToGoal(input: RunAgentToGoalInput): Promise<RunAgentToGoalResult> {
  const stepTrace: AgentStepTraceEntry[] = [];
  let spentUsd = 0;
  let killed = false;
  let capReached = false;

  const wrappedExecuteTool: ToolExecutor = async (name, toolInput) => {
    if (await input.hooks.isKilled()) {
      killed = true;
      const outputSummary = "Refused: this agent run was killed before this tool call executed.";
      stepTrace.push({ toolName: name, toolInput, outputSummary, isError: true, costUsd: 0 });
      return { content: outputSummary, isError: true };
    }

    const capCheck = checkSpendCap(spentUsd, input.spendCapUsd);
    if (!capCheck.allowed) {
      capReached = true;
      const outputSummary = `Refused: ${capCheck.reason}`;
      stepTrace.push({ toolName: name, toolInput, outputSummary, isError: true, costUsd: 0 });
      return { content: outputSummary, isError: true };
    }

    const result = await input.executeTool(name, toolInput);
    const costUsd = extractCostUsd(result.content);
    spentUsd += costUsd;
    stepTrace.push({ toolName: name, toolInput, outputSummary: result.content, isError: Boolean(result.isError), costUsd });
    return result;
  };

  const conversationResult = await runAssistantConversation({
    provider: input.provider,
    system: [
      "You are an autonomous AI agent working on behalf of a workspace, toward exactly one goal, under a hard spend ceiling enforced independently of your own judgment.",
      `Your goal: ${input.goal}`,
      "None of your tools can autonomously publish content to a real audience — they only draft, preview, or read. A human reviews and commits anything further.",
      "If a tool call is refused because the spend cap was reached or the run was killed, stop immediately and report what you accomplished so far.",
    ].join(" "),
    tools: input.tools,
    conversation: [{ role: "user", content: input.goal }],
    executeTool: wrappedExecuteTool,
    maxToolRounds: input.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS,
  });

  spentUsd += conversationResult.totalCostUsd;
  const status: AgentRunStatus = killed ? "killed" : capReached ? "spend_cap_reached" : "completed";

  return { reply: conversationResult.reply, status, stepTrace, totalCostUsd: spentUsd };
}
