import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { OpenAITextProvider } from "../openai.provider.js";

/** Same local-mock-server approach as anthropic.provider.test.ts — see that file's module doc for why. */
describe("OpenAITextProvider against a local mock OpenAI-Responses-shaped server", () => {
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
              id: "resp_test",
              object: "response",
              status: "completed",
              output: [
                {
                  type: "message",
                  id: "msg_1",
                  status: "completed",
                  role: "assistant",
                  content: [{ type: "output_text", text: JSON.stringify({ hello: "world" }), annotations: [] }],
                },
              ],
              usage: { input_tokens: 55, output_tokens: 21 },
            },
          ),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseURL = `http://127.0.0.1:${port}/v1`;
  });

  afterEach(() => {
    responseOverride = null;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("sends a strict json_schema response format carrying exactly the schema passed in", async () => {
    const provider = new OpenAITextProvider("gpt-4.1", "test-key", ["growth"], baseURL);
    await provider.generateStructured({
      system: "You write hooks.",
      input: "storyboard here",
      schema: { type: "object", properties: { hook: { type: "string" } } },
      maxTokens: 500,
      temperature: 0.7,
    });

    const body = lastRequestBody as { text: { format: { type: string; schema: unknown; strict: boolean } }; instructions: string; max_output_tokens: number; temperature: number };
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema).toEqual({ type: "object", properties: { hook: { type: "string" } } });
    expect(body.instructions).toBe("You write hooks.");
    expect(body.max_output_tokens).toBe(500);
    expect(body.temperature).toBe(0.7);
  });

  it("parses output_text as JSON for the result data, and computes cost from real usage tokens", async () => {
    const provider = new OpenAITextProvider("gpt-4.1", "test-key", ["growth"], baseURL);
    const result = await provider.generateStructured<unknown, { hello: string }>({
      system: "sys",
      input: "in",
      schema: {},
      maxTokens: 500,
      temperature: 0.5,
    });

    expect(result.data).toEqual({ hello: "world" });
    expect(result.usage).toEqual({ inputTokens: 55, outputTokens: 21 });
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("throws a clear error when the response has no output_text despite a strict schema request", async () => {
    responseOverride = { id: "resp_test", object: "response", status: "incomplete", output: [], usage: { input_tokens: 5, output_tokens: 0 } };
    const provider = new OpenAITextProvider("gpt-4.1", "test-key", ["growth"], baseURL);
    await expect(provider.generateStructured({ system: "s", input: "i", schema: {}, maxTokens: 100, temperature: 0.5 })).rejects.toThrow(/output_text/);
  });

  it("reports the router-compatible capability manifest with commercialUse true and strict_json_schema", () => {
    const provider = new OpenAITextProvider("gpt-4.1", "test-key", ["growth", "pro"], baseURL);
    expect(provider.capabilities.commercialUse).toBe(true);
    expect(provider.capabilities.structuredOutputMethod).toBe("strict_json_schema");
    expect(provider.estimateCost({ characters: 1000 })).toBeCloseTo(1000 * provider.capabilities.costPerCharacter, 10);
  });
});
