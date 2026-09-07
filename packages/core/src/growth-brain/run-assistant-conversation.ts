import type { AssistantProvider, AssistantTool, ConversationTurn } from "@velocity/text-engine";

/**
 * The real agentic loop STEP 14's AI Assistant runs on (build script:
 * "AI Assistant: chat over the workspace's content, brand and
 * performance data with tool access to create concepts, schedule and
 * pull analytics"). Deliberately generic over `AssistantProvider` (the
 * real Anthropic adapter or the deterministic stub — see @velocity/
 * text-engine) and `executeTool` (the actual tool implementations,
 * injected by the caller) — this function drives the round-trip
 * mechanics only, exactly the same "pure orchestration, real I/O
 * injected" split used throughout this codebase (calendar/auto-fill.ts,
 * publish/preflight.ts).
 *
 * `executeTool` is a closure the CALLER builds, bound to its own
 * already-authenticated workspaceId — it is never given a workspaceId
 * as a parameter here, and none of GROWTH_BRAIN_TOOLS' input schemas
 * declare one (tools.ts). This is what makes GATE 14's "the assistant
 * cannot reach another workspace's data" true by construction: there is
 * no code path through which a tool call's `input` (LLM-authored, and
 * therefore adversarially-controllable via prompt injection) could ever
 * become the workspaceId a tool handler actually queries.
 */

export type ToolExecutor = (name: string, input: unknown) => Promise<{ content: string; isError?: boolean }>;

export interface ToolCallLogEntry {
  name: string;
  input: unknown;
  outputSummary: string;
  isError: boolean;
}

export interface RunAssistantConversationInput {
  provider: AssistantProvider;
  system: string;
  tools: AssistantTool[];
  /** Prior turns plus the new user message already appended — this function doesn't append the user's own message for the caller. */
  conversation: ConversationTurn[];
  executeTool: ToolExecutor;
  maxToolRounds?: number;
  maxTokens?: number;
}

export interface RunAssistantConversationResult {
  reply: string;
  conversation: ConversationTurn[];
  toolCallLog: ToolCallLogEntry[];
  totalCostUsd: number;
}

const DEFAULT_MAX_TOOL_ROUNDS = 5;
const DEFAULT_MAX_TOKENS = 1024;

export async function runAssistantConversation(input: RunAssistantConversationInput): Promise<RunAssistantConversationResult> {
  let conversation = [...input.conversation];
  const toolCallLog: ToolCallLogEntry[] = [];
  let totalCostUsd = 0;
  const maxRounds = input.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;

  for (let round = 0; round < maxRounds; round++) {
    const stepResult = await input.provider.step({ system: input.system, tools: input.tools, conversation, maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS });
    totalCostUsd += stepResult.costUsd;
    conversation = [...conversation, { role: "assistant", content: stepResult.text, toolCalls: stepResult.toolCalls }];

    if (stepResult.stopReason !== "tool_use" || stepResult.toolCalls.length === 0) {
      return { reply: stepResult.text ?? "", conversation, toolCallLog, totalCostUsd };
    }

    for (const call of stepResult.toolCalls) {
      const result = await input.executeTool(call.name, call.input);
      toolCallLog.push({ name: call.name, input: call.input, outputSummary: result.content, isError: Boolean(result.isError) });
      conversation = [...conversation, { role: "tool_result", toolCallId: call.id, content: result.content, isError: result.isError }];
    }
  }

  return {
    reply: "I've reached the maximum number of tool calls for this turn — here's what I found so far.",
    conversation,
    toolCallLog,
    totalCostUsd,
  };
}
