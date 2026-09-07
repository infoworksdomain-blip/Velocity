import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnthropicTextProvider } from "../anthropic.provider.js";
import { OpenAITextProvider } from "../openai.provider.js";
import { TEXT_PLAN_JSON_SCHEMA } from "../../json-schema.js";

/**
 * ADR 0005's mechanical proof: "a test asserts structural equality between
 * what both adapters produce from the same input, confirming the schema
 * didn't silently diverge." Both adapters are given the exact same
 * TEXT_PLAN_JSON_SCHEMA object and asked to wrap it for their vendor's API
 * — this test captures what each ACTUALLY sent over the wire (via one
 * local server logging every request body by path) and asserts the wrapped
 * schema is byte-for-byte identical between them, not just "close enough."
 */
describe("GATE 8B: one schema drives both adapters with identical output shape", () => {
  let server: http.Server;
  let baseURL: string;
  const requestsByPath: Record<string, unknown> = {};

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        requestsByPath[req.url ?? "unknown"] = JSON.parse(raw);
        res.writeHead(200, { "content-type": "application/json" });
        if (req.url?.includes("messages")) {
          res.end(
            JSON.stringify({
              id: "msg_1",
              type: "message",
              role: "assistant",
              model: "claude-sonnet-4-6",
              stop_reason: "tool_use",
              content: [{ type: "tool_use", id: "t1", name: "emit_text_plan", input: {} }],
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
          );
        } else {
          res.end(
            JSON.stringify({
              id: "resp_1",
              object: "response",
              status: "completed",
              output: [{ type: "message", id: "m1", status: "completed", role: "assistant", content: [{ type: "output_text", text: "{}", annotations: [] }] }],
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
          );
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseURL = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("wraps the exact same schema object for both vendors, unchanged", async () => {
    const anthropic = new AnthropicTextProvider("claude-sonnet-4-6", "k", ["growth"], baseURL);
    const openai = new OpenAITextProvider("gpt-4.1", "k", ["growth"], `${baseURL}/v1`);

    const sharedArgs = { system: "You write hooks.", input: "storyboard here", schema: TEXT_PLAN_JSON_SCHEMA, maxTokens: 2000, temperature: 0.7 };
    await anthropic.generateStructured(sharedArgs);
    await openai.generateStructured(sharedArgs);

    const anthropicRequest = requestsByPath["/v1/messages"] as { tools: { input_schema: unknown }[] };
    const openaiRequest = requestsByPath["/v1/responses"] as { text: { format: { schema: unknown } } };

    expect(anthropicRequest).toBeDefined();
    expect(openaiRequest).toBeDefined();
    expect(anthropicRequest.tools[0]!.input_schema).toEqual(TEXT_PLAN_JSON_SCHEMA);
    expect(openaiRequest.text.format.schema).toEqual(TEXT_PLAN_JSON_SCHEMA);
    // The real point of this test: the two vendors' wrapped schemas are
    // structurally identical to EACH OTHER, not just each equal to the
    // source in isolation (which could still pass if one adapter forked a
    // near-identical copy).
    expect(anthropicRequest.tools[0]!.input_schema).toEqual(openaiRequest.text.format.schema);
  });
});
