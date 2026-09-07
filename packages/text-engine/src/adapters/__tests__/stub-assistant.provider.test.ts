import { describe, expect, it } from "vitest";
import { StubAssistantProvider } from "../stub-assistant.provider";
import type { AssistantTool } from "../../assistant-types";

const TOOLS: AssistantTool[] = [
  { name: "create_content_concepts", description: "d", inputSchema: {} },
  { name: "schedule_content", description: "d", inputSchema: {} },
  { name: "pull_analytics", description: "d", inputSchema: {} },
];

describe("StubAssistantProvider", () => {
  it("matches a real tool call from keyword intent (analytics)", async () => {
    const provider = new StubAssistantProvider();
    const result = await provider.step({ system: "s", tools: TOOLS, conversation: [{ role: "user", content: "how is my performance doing? show me analytics" }], maxTokens: 500 });
    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls[0]!.name).toBe("pull_analytics");
  });

  it("matches a real tool call from keyword intent (schedule)", async () => {
    const provider = new StubAssistantProvider();
    const result = await provider.step({ system: "s", tools: TOOLS, conversation: [{ role: "user", content: "please schedule my content for the week" }], maxTokens: 500 });
    expect(result.toolCalls[0]!.name).toBe("schedule_content");
  });

  it("matches a real tool call from keyword intent (concepts)", async () => {
    const provider = new StubAssistantProvider();
    const result = await provider.step({ system: "s", tools: TOOLS, conversation: [{ role: "user", content: "generate some new content ideas" }], maxTokens: 500 });
    expect(result.toolCalls[0]!.name).toBe("create_content_concepts");
  });

  it("returns a plain informational reply with no tool call when nothing matches", async () => {
    const provider = new StubAssistantProvider();
    const result = await provider.step({ system: "s", tools: TOOLS, conversation: [{ role: "user", content: "what's the weather like" }], maxTokens: 500 });
    expect(result.stopReason).toBe("end_turn");
    expect(result.toolCalls).toEqual([]);
    expect(result.text).toBeTruthy();
  });

  it("only ever proposes a tool that was actually offered in this call's tools list", async () => {
    const provider = new StubAssistantProvider();
    const result = await provider.step({ system: "s", tools: [TOOLS[0]!], conversation: [{ role: "user", content: "pull analytics please" }], maxTokens: 500 });
    expect(result.toolCalls).toEqual([]); // pull_analytics wasn't offered — must not be called anyway
  });

  it("summarizes a tool_result and ends the turn on the follow-up step, rather than looping", async () => {
    const provider = new StubAssistantProvider();
    const result = await provider.step({
      system: "s",
      tools: TOOLS,
      conversation: [
        { role: "user", content: "pull analytics" },
        { role: "assistant", content: null, toolCalls: [{ id: "c1", name: "pull_analytics", input: {} }] },
        { role: "tool_result", toolCallId: "c1", content: "tiktok: 5% engagement" },
      ],
      maxTokens: 500,
    });
    expect(result.stopReason).toBe("end_turn");
    expect(result.toolCalls).toEqual([]);
    expect(result.text).toContain("tiktok: 5% engagement");
  });
});
