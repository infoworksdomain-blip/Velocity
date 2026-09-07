import type { TokenUsage } from "./types.js";

/**
 * The AI Assistant's multi-turn, multi-tool chat contract (STEP 14) —
 * deliberately separate from `TextProvider`'s `generateStructured`
 * (STEP 8B), which is single-turn and locked to exactly one forced tool
 * for schema extraction. A chat assistant needs a real conversation
 * (user turns, assistant turns that may request tool calls, tool-result
 * turns feeding back in) and an arbitrary, caller-supplied tool list —
 * a genuinely different shape, not a generalization of the existing one.
 */

export interface AssistantTool {
  name: string;
  description: string;
  /** JSON Schema (draft-07-ish) describing the tool's input — the same shape TextPlan schemas already use for forced tool-use. */
  inputSchema: Record<string, unknown>;
}

export interface AssistantToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type ConversationTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls: AssistantToolCall[] }
  | { role: "tool_result"; toolCallId: string; content: string; isError?: boolean };

export interface AssistantStepArgs {
  system: string;
  tools: AssistantTool[];
  conversation: ConversationTurn[];
  maxTokens: number;
}

export interface AssistantStepResult {
  stopReason: "tool_use" | "end_turn" | "max_tokens";
  text: string | null;
  toolCalls: AssistantToolCall[];
  usage: TokenUsage;
  costUsd: number;
}

/** One real vendor round-trip (`step`) — the caller (packages/core's assistant orchestration) drives the actual agentic loop: call step(), execute any returned tool calls for real, append their results as `tool_result` turns, call step() again, until `stopReason` is `"end_turn"` or a round cap is hit. */
export interface AssistantProvider {
  id: string;
  model: string;
  step(args: AssistantStepArgs): Promise<AssistantStepResult>;
}
