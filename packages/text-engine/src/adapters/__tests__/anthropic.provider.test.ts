import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AnthropicTextProvider } from "../anthropic.provider.js";

/**
 * A real HTTP server mimicking the Anthropic Messages API's real response
 * shape, exercised via the real @anthropic-ai/sdk client with `baseURL`
 * pointed at it — the same "real code against a local honeypot, not a
 * mocked module" pattern STEP 6 uses for SSRF testing, applied here
 * because there is no funded Anthropic API key in this environment to call
 * the live API (see this adapter's own module doc). This proves the
 * REQUEST shape the real SDK actually sends (forced tool_choice, the exact
 * schema) and that the adapter correctly parses a realistic response, not
 * just that hand-written code compiles.
 */
describe("AnthropicTextProvider against a local mock Anthropic-shaped server", () => {
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
              content: [{ type: "tool_use", id: "toolu_1", name: "emit_text_plan", input: { hello: "world" } }],
              usage: { input_tokens: 42, output_tokens: 17 },
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

  it("sends a forced tool_choice pointed at exactly one tool whose input_schema is the schema passed in", async () => {
    const provider = new AnthropicTextProvider("claude-sonnet-4-6", "test-key", ["growth"], baseURL);
    await provider.generateStructured({
      system: "You write hooks.",
      input: "storyboard here",
      schema: { type: "object", properties: { hook: { type: "string" } } },
      maxTokens: 500,
      temperature: 0.7,
    });

    const body = lastRequestBody as { tools: { name: string; input_schema: unknown }[]; tool_choice: { type: string; name: string }; system: string; max_tokens: number; temperature: number };
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toEqual({ type: "tool", name: body.tools[0]!.name });
    expect(body.tools[0]!.input_schema).toEqual({ type: "object", properties: { hook: { type: "string" } } });
    expect(body.system).toBe("You write hooks.");
    expect(body.max_tokens).toBe(500);
    expect(body.temperature).toBe(0.7);
  });

  it("parses the tool_use block's input as the result data, and computes cost from real usage tokens", async () => {
    const provider = new AnthropicTextProvider("claude-sonnet-4-6", "test-key", ["growth"], baseURL);
    const result = await provider.generateStructured<unknown, { hello: string }>({
      system: "sys",
      input: "in",
      schema: {},
      maxTokens: 500,
      temperature: 0.5,
    });

    expect(result.data).toEqual({ hello: "world" });
    expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 17 });
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("throws a clear error if the response has no tool_use block despite forcing tool_choice — a real vendor contract violation, not silently returning garbage", async () => {
    responseOverride = {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "sorry, I can't do that" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const provider = new AnthropicTextProvider("claude-sonnet-4-6", "test-key", ["growth"], baseURL);
    await expect(provider.generateStructured({ system: "s", input: "i", schema: {}, maxTokens: 100, temperature: 0.5 })).rejects.toThrow(/tool_use/);
  });

  it("reports the router-compatible capability manifest with commercialUse true and forced_tool_use", () => {
    const provider = new AnthropicTextProvider("claude-sonnet-4-6", "test-key", ["growth", "pro"], baseURL);
    expect(provider.capabilities.commercialUse).toBe(true);
    expect(provider.capabilities.structuredOutputMethod).toBe("forced_tool_use");
    expect(provider.capabilities.tiers).toEqual(["growth", "pro"]);
    expect(provider.estimateCost({ characters: 1000 })).toBeCloseTo(1000 * provider.capabilities.costPerCharacter, 10);
  });
});
