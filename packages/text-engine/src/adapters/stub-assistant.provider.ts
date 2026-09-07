import type { AssistantProvider, AssistantStepArgs, AssistantStepResult, AssistantTool } from "../assistant-types.js";

/**
 * Deterministic stand-in for a real AssistantProvider (STEP 14), used
 * automatically whenever no funded Anthropic API key is configured —
 * the same boundary stub.provider.ts already draws for STEP 8B's
 * TextProvider. A real chat assistant's actual value is in the LLM's
 * judgment about WHEN and HOW to call a tool from free-text intent —
 * that specific capability cannot be faked without an LLM, so this stub
 * is honestly limited to simple keyword-triggered tool calls (real tool
 * calls, real deterministic behaviour) rather than pretending to
 * understand arbitrary requests. Good enough to prove the orchestration
 * loop (packages/core) end to end without a funded key; not a
 * replacement for the real adapter's actual language understanding.
 */
export class StubAssistantProvider implements AssistantProvider {
  readonly id = "anthropic" as const;
  readonly model = "stub-assistant-v1";

  async step(args: AssistantStepArgs): Promise<AssistantStepResult> {
    const lastUserTurn = [...args.conversation].reverse().find((t) => t.role === "user");
    const lastToolResultTurns = args.conversation.filter((t) => t.role === "tool_result");

    // A tool_result just came back (this is a follow-up step in the loop) — summarize it and end the turn, rather than looping forever.
    if (lastToolResultTurns.length > 0 && args.conversation[args.conversation.length - 1]?.role === "tool_result") {
      const summary = lastToolResultTurns.map((t) => (t.role === "tool_result" ? t.content : "")).join(" ");
      return { stopReason: "end_turn", text: `Done. Result: ${summary.slice(0, 300)}`, toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 };
    }

    const matchedTool = matchToolFromIntent(lastUserTurn?.role === "user" ? lastUserTurn.content : "", args.tools);
    if (matchedTool) {
      return {
        stopReason: "tool_use",
        text: null,
        toolCalls: [{ id: `stub_call_${Date.now()}`, name: matchedTool.name, input: {} }],
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 0,
      };
    }

    return {
      stopReason: "end_turn",
      text: "I can help create concepts, schedule content, or pull analytics — ask me to do one of those, or connect a real Anthropic API key for open-ended conversation.",
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
    };
  }
}

const INTENT_KEYWORDS: Record<string, string[]> = {
  create_content_concepts: ["concept", "idea", "generate content", "new post idea"],
  schedule_content: ["schedule", "calendar", "auto-fill", "autofill"],
  pull_analytics: ["analytics", "performance", "how are my posts doing", "metrics"],
};

function matchToolFromIntent(message: string, availableTools: AssistantTool[]): AssistantTool | null {
  const lower = message.toLowerCase();
  for (const tool of availableTools) {
    const keywords = INTENT_KEYWORDS[tool.name] ?? [];
    if (keywords.some((kw) => lower.includes(kw))) return tool;
  }
  return null;
}

export function createStubAssistantProvider(): StubAssistantProvider {
  return new StubAssistantProvider();
}
