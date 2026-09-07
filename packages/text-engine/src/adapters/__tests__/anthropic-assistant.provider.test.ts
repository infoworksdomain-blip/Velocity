import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AnthropicAssistantProvider } from "../anthropic-assistant.provider.js";
import type { AssistantTool, ConversationTurn } from "../../assistant-types.js";

const TOOLS: AssistantTool[] = [
  { name: "pull_analytics", description: "Pull performance analytics", inputSchema: { type: "object", properties: { groupBy: { type: "string" } } } },
];

/**
 * Same "real SDK client, baseURL pointed at a local mock server" pattern
 * as anthropic.provider.test.ts — proves the actual request shape a
 * multi-turn, multi-tool conversation sends, and that tool_use/text
 * blocks in a real response are parsed correctly.
 */
describe("AnthropicAssistantProvider against a local mock Anthropic-shaped server", () => {
  let server: http.Server;
  let baseURL: string;
  let lastRequestBody: unknown;
  let responseOverride: unknown = null;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        lastRequestBody = JSON.parse(raw);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify(
            responseOverride ?? {
              id: "msg_test",
              type: "message",
              role: "assistant",
              model: "claude-sonnet-4-6",
              stop_reason: "tool_use",
              content: [{ type: "tool_use", id: "toolu_1", name: "pull_analytics", input: { groupBy: "platform" } }],
              usage: { input_tokens: 30, output_tokens: 12 },
            },
          ),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseURL = `http://127.0.0.1:${port}`;
  });

  afterEach(() => {
    responseOverride = null;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("sends the tool list (not forced) and the conversation as real Anthropic messages", async () => {
    const provider = new AnthropicAssistantProvider("claude-sonnet-4-6", "test-key", baseURL);
    const conversation: ConversationTurn[] = [{ role: "user", content: "how are my posts doing?" }];
    await provider.step({ system: "You are a growth assistant.", tools: TOOLS, conversation, maxTokens: 500 });

    const body = lastRequestBody as { tools: { name: string }[]; tool_choice?: unknown; messages: { role: string; content: unknown }[]; system: string };
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]!.name).toBe("pull_analytics");
    expect(body.tool_choice).toBeUndefined(); // NOT forced — the model decides whether to call a tool at all
    expect(body.messages).toEqual([{ role: "user", content: "how are my posts doing?" }]);
    expect(body.system).toBe("You are a growth assistant.");
  });

  it("parses a tool_use response into a real AssistantToolCall with stopReason tool_use", async () => {
    const provider = new AnthropicAssistantProvider("claude-sonnet-4-6", "test-key", baseURL);
    const result = await provider.step({ system: "s", tools: TOOLS, conversation: [{ role: "user", content: "pull analytics" }], maxTokens: 500 });

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toEqual([{ id: "toolu_1", name: "pull_analytics", input: { groupBy: "platform" } }]);
    expect(result.text).toBeNull();
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("parses a plain text response with stopReason end_turn", async () => {
    responseOverride = {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Your top format is memes." }],
      usage: { input_tokens: 20, output_tokens: 8 },
    };
    const provider = new AnthropicAssistantProvider("claude-sonnet-4-6", "test-key", baseURL);
    const result = await provider.step({ system: "s", tools: TOOLS, conversation: [{ role: "user", content: "hi" }], maxTokens: 500 });

    expect(result.stopReason).toBe("end_turn");
    expect(result.text).toBe("Your top format is memes.");
    expect(result.toolCalls).toEqual([]);
  });

  it("bundles consecutive tool_result turns into ONE user message with multiple tool_result blocks (Anthropic's real wire format requirement)", async () => {
    const provider = new AnthropicAssistantProvider("claude-sonnet-4-6", "test-key", baseURL);
    const conversation: ConversationTurn[] = [
      { role: "user", content: "pull analytics and schedule content" },
      { role: "assistant", content: null, toolCalls: [{ id: "call-1", name: "pull_analytics", input: {} }, { id: "call-2", name: "schedule_content", input: {} }] },
      { role: "tool_result", toolCallId: "call-1", content: "analytics result" },
      { role: "tool_result", toolCallId: "call-2", content: "schedule result" },
    ];
    await provider.step({ system: "s", tools: TOOLS, conversation, maxTokens: 500 });

    const body = lastRequestBody as { messages: { role: string; content: unknown }[] };
    expect(body.messages).toHaveLength(3); // user, assistant(tool_use x2), user(tool_result x2) — not 4 separate messages
    const toolResultMessage = body.messages[2]!;
    expect(toolResultMessage.role).toBe("user");
    expect(toolResultMessage.content).toEqual([
      { type: "tool_result", tool_use_id: "call-1", content: "analytics result", is_error: undefined },
      { type: "tool_result", tool_use_id: "call-2", content: "schedule result", is_error: undefined },
    ]);
  });
});
