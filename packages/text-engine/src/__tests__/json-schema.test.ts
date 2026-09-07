import { describe, expect, it } from "vitest";
import { TEXT_PLAN_JSON_SCHEMA, enforceStrictObjectSchema } from "../json-schema.js";

describe("TEXT_PLAN_JSON_SCHEMA", () => {
  it("is a plain object schema with no internal $ref (refStrategy: none inlined everything)", () => {
    const raw = JSON.stringify(TEXT_PLAN_JSON_SCHEMA);
    expect(raw).not.toContain("$ref");
  });

  it("recursively sets additionalProperties: false on every object node, per OpenAI's strict mode requirement", () => {
    function assertNoExtraProps(node: unknown): void {
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        if (obj.type === "object" && obj.properties) {
          expect(obj.additionalProperties).toBe(false);
          for (const child of Object.values(obj.properties as Record<string, unknown>)) assertNoExtraProps(child);
        }
        if (obj.items) {
          if (Array.isArray(obj.items)) obj.items.forEach(assertNoExtraProps);
          else assertNoExtraProps(obj.items);
        }
      }
    }
    assertNoExtraProps(TEXT_PLAN_JSON_SCHEMA);
  });

  it("has the hookVariants property, matching the frozen TextPlan contract", () => {
    const schema = TEXT_PLAN_JSON_SCHEMA as { properties?: Record<string, unknown> };
    expect(schema.properties).toHaveProperty("hookVariants");
    expect(schema.properties).toHaveProperty("overlays");
    expect(schema.properties).toHaveProperty("hook");
  });
});

describe("enforceStrictObjectSchema", () => {
  it("is idempotent — applying it twice gives the same result", () => {
    const once = enforceStrictObjectSchema({ type: "object", properties: { a: { type: "string" } } });
    const twice = enforceStrictObjectSchema(structuredClone(once));
    expect(twice).toEqual(once);
  });

  it("leaves non-object nodes (arrays of primitives, scalars) untouched", () => {
    const schema = enforceStrictObjectSchema({ type: "array", items: { type: "string" } });
    expect(schema).toEqual({ type: "array", items: { type: "string" } });
  });
});
