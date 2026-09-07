import Anthropic from "@anthropic-ai/sdk";
import type { AssistantProvider, AssistantStepArgs, AssistantStepResult, AssistantToolCall, ConversationTurn } from "../assistant-types.js";
import { calculateCostUsd } from "./pricing.js";

/**
 * The real Anthropic Messages API adapter for STEP 14's AI Assistant —
 * genuine multi-turn conversation with an arbitrary, caller-supplied
 * tool list (as opposed to anthropic.provider.ts's single forced-tool
 * structured extraction). Same "real SDK-calling code, request-shape-
 * tested against a local mock Anthropic-compatible server" discipline —
 * no funded Anthropic API key exists in this sandbox to call the live
 * API (see anthropic.provider.ts's own doc comment for the established
 * precedent this follows).
 */
export class AnthropicAssistantProvider implements AssistantProvider {
  readonly id = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    apiKey: string,
    baseURL?: string,
  ) {
    this.client = new Anthropic({ apiKey, baseURL });
  }

  async step(args: AssistantStepArgs): Promise<AssistantStepResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: toAnthropicMessages(args.conversation),
      tools: args.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
      })),
    });

    const toolCalls: AssistantToolCall[] = response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
      .map((block) => ({ id: block.id, name: block.name, input: block.input }));

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");

    const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    const stopReason = response.stop_reason === "tool_use" ? "tool_use" : response.stop_reason === "max_tokens" ? "max_tokens" : "end_turn";

    return {
      stopReason,
      text: textBlock?.text ?? null,
      toolCalls,
      usage,
      costUsd: calculateCostUsd(this.model, usage),
    };
  }
}

/**
 * Anthropic's wire format requires every tool_result for a given
 * assistant turn's tool_use blocks to be bundled into ONE user-role
 * message with multiple `tool_result` content blocks — not one user
 * message per result. This groups consecutive `tool_result` turns from
 * the internal representation into that shape; a real detail that's
 * easy to get wrong (and the reason this has its own function and its
 * own test, rather than being inlined).
 */
function toAnthropicMessages(conversation: ConversationTurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = [];

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      messages.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const turn of conversation) {
    if (turn.role === "tool_result") {
      pendingToolResults.push({ type: "tool_result", tool_use_id: turn.toolCallId, content: turn.content, is_error: turn.isError });
      continue;
    }
    flushToolResults();

    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else {
      const content: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
      if (turn.content) content.push({ type: "text", text: turn.content });
      for (const call of turn.toolCalls) content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input as Record<string, unknown> });
      messages.push({ role: "assistant", content });
    }
  }
  flushToolResults();

  return messages;
}
