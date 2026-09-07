import { describe, expect, it } from "vitest";
import { createStubTextProvider } from "../stub.provider.js";
import { TEXT_PLAN_JSON_SCHEMA } from "../../json-schema.js";
import { TextPlanSchema } from "../../text-plan.schema.js";

describe("StubTextProvider", () => {
  it("produces a schema-valid TextPlan when asked for one (schema contains hookVariants)", async () => {
    const provider = createStubTextProvider("anthropic", ["growth"]);
    const result = await provider.generateStructured({
      system: "sys",
      input: JSON.stringify({ productFacts: { product: "TaskFlow" } }),
      schema: TEXT_PLAN_JSON_SCHEMA,
      maxTokens: 500,
      temperature: 0.7,
    });
    expect(TextPlanSchema.safeParse(result.data).success).toBe(true);
  });

  it("is deterministic — identical input produces identical output", async () => {
    const provider = createStubTextProvider("openai", ["growth"]);
    const args = { system: "sys", input: JSON.stringify({ productFacts: { product: "Acme" } }), schema: TEXT_PLAN_JSON_SCHEMA, maxTokens: 500, temperature: 0.7 };
    const a = await provider.generateStructured(args);
    const b = await provider.generateStructured(args);
    expect(a.data).toEqual(b.data);
  });

  it("falls back to a generic echo shape for a non-TextPlan schema request (e.g. angle generation)", async () => {
    const provider = createStubTextProvider("anthropic", ["growth"]);
    const result = await provider.generateStructured({ system: "sys", input: "some angle-generation input", schema: { type: "object" }, maxTokens: 100, temperature: 0.5 });
    expect(result.data).toHaveProperty("echo");
  });

  it("reports a positive cost proportional to input length", async () => {
    const provider = createStubTextProvider("anthropic", ["growth"]);
    const short = await provider.generateStructured({ system: "s", input: "a", schema: {}, maxTokens: 10, temperature: 0.5 });
    const long = await provider.generateStructured({ system: "s", input: "a".repeat(1000), schema: {}, maxTokens: 10, temperature: 0.5 });
    expect(long.costUsd).toBeGreaterThan(short.costUsd);
  });
});
