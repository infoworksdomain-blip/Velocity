import { describe, expect, it, vi } from "vitest";
import type { AssistantProvider, AssistantStepArgs, AssistantStepResult } from "@velocity/text-engine";
import { runAgentToGoal } from "../run-agent";

function provider(steps: AssistantStepResult[]): AssistantProvider {
  let call = 0;
  return {
    id: "test",
    model: "test-model",
    step: vi.fn(async (_args: AssistantStepArgs) => {
      const result = steps[call];
      call += 1;
      if (!result) throw new Error("provider.step called more times than the test provided canned results for");
      return result;
    }),
  };
}

const notKilled = { isKilled: async () => false };

describe("runAgentToGoal", () => {
  it("completes successfully when the model finishes within its spend cap without ever calling a tool", async () => {
    const p = provider([{ stopReason: "end_turn", text: "Goal already satisfied — nothing to do.", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01 }]);
    const result = await runAgentToGoal({ provider: p, goal: "keep my calendar full", tools: [], executeTool: vi.fn(), spendCapUsd: 10, hooks: notKilled });

    expect(result.status).toBe("completed");
    expect(result.totalCostUsd).toBeCloseTo(0.01, 6);
    expect(result.stepTrace).toEqual([]);
  });

  it("executes real tool calls, records a full step trace, and reports completed status", async () => {
    const p = provider([
      { stopReason: "tool_use", text: null, toolCalls: [{ id: "c1", name: "create_content_concepts", input: { formats: ["meme"] } }], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01 },
      { stopReason: "end_turn", text: "Generated 5 concepts.", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01 },
    ]);
    const executeTool = vi.fn(async () => ({ content: JSON.stringify({ concepts: [1, 2, 3, 4, 5], costUsd: 0.5 }) }));
    const result = await runAgentToGoal({ provider: p, goal: "generate 5 concepts", tools: [], executeTool, spendCapUsd: 10, hooks: notKilled });

    expect(result.status).toBe("completed");
    expect(result.stepTrace).toHaveLength(1);
    expect(result.stepTrace[0]!.toolName).toBe("create_content_concepts");
    expect(result.stepTrace[0]!.costUsd).toBeCloseTo(0.5, 6);
    // Total spend includes both the tool's real generation cost AND the LLM orchestration cost.
    expect(result.totalCostUsd).toBeCloseTo(0.52, 6);
  });

  it("genuinely blocks execution once cumulative spend has already exceeded the cap", async () => {
    const p = provider([
      { stopReason: "tool_use", text: null, toolCalls: [{ id: "c1", name: "create_content_concepts", input: {} }], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 },
      { stopReason: "tool_use", text: null, toolCalls: [{ id: "c2", name: "create_content_concepts", input: {} }], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 },
      { stopReason: "end_turn", text: "done", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 },
    ]);
    const executeTool = vi.fn(async () => ({ content: JSON.stringify({ costUsd: 15 }) })); // a single call already blows the $10 cap
    const result = await runAgentToGoal({ provider: p, goal: "spend a lot", tools: [], executeTool, spendCapUsd: 10, hooks: notKilled });

    expect(executeTool).toHaveBeenCalledTimes(1); // the first call executes (0 <= 10 before it runs); the second is refused since spend (15) now exceeds the cap
    expect(result.status).toBe("spend_cap_reached");
    expect(result.stepTrace[1]!.isError).toBe(true);
    expect(result.stepTrace[1]!.outputSummary).toContain("Refused");
  });

  it("stops calling tools and reports killed status once the kill switch is set mid-run, checked fresh before each call", async () => {
    const p = provider([
      { stopReason: "tool_use", text: null, toolCalls: [{ id: "c1", name: "create_content_concepts", input: {} }], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 },
      { stopReason: "tool_use", text: null, toolCalls: [{ id: "c2", name: "create_content_concepts", input: {} }], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 },
      { stopReason: "end_turn", text: "done", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 },
    ]);
    let checkCount = 0;
    const executeTool = vi.fn(async () => ({ content: "{}" }));
    // First check (before call 1) returns false; from the second check onward (before call 2) returns true — proves the switch is re-read fresh, not cached from the first check.
    const hooks = { isKilled: async () => { checkCount += 1; return checkCount > 1; } };
    const result = await runAgentToGoal({ provider: p, goal: "do two things but get killed after the first", tools: [], executeTool, spendCapUsd: 100, hooks });

    expect(executeTool).toHaveBeenCalledTimes(1); // only the first call, made before the kill took effect, actually executed
    expect(result.status).toBe("killed");
    expect(result.stepTrace[1]!.outputSummary).toContain("killed");
  });

  it("reports killed status and refuses execution when the kill switch is already set from the start", async () => {
    const p = provider([
      { stopReason: "tool_use", text: null, toolCalls: [{ id: "c1", name: "create_content_concepts", input: {} }], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 },
      { stopReason: "end_turn", text: "stopped", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 },
    ]);
    const executeTool = vi.fn(async () => ({ content: "{}" }));
    const result = await runAgentToGoal({ provider: p, goal: "do something", tools: [], executeTool, spendCapUsd: 100, hooks: { isKilled: async () => true } });

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.status).toBe("killed");
    expect(result.stepTrace[0]!.outputSummary).toContain("killed");
  });
});
