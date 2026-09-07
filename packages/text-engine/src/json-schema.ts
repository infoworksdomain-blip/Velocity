import { zodToJsonSchema } from "zod-to-json-schema";
import { TextPlanSchema } from "./text-plan.schema.js";

/** Minimal shape this module actually touches — the real output of zod-to-json-schema is much richer, but recursing generically only needs to know about these three keys. */
interface JsonSchemaNode {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode | JsonSchemaNode[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/**
 * OpenAI's strict structured-output mode requires `additionalProperties:
 * false` on every object node, recursively — zod-to-json-schema doesn't add
 * this unless the zod schema itself calls `.strict()`, which the frozen
 * TextPlanSchema (STEP 1) doesn't. Rather than retrofit `.strict()` calls
 * across a contract other code already depends on, this walks the
 * generated JSON Schema and enforces the constraint mechanically —
 * provably total (every object node visited) and independent of how the
 * zod schema itself is written.
 */
export function enforceStrictObjectSchema(node: JsonSchemaNode): JsonSchemaNode {
  if (node.type === "object" && node.properties) {
    node.additionalProperties = false;
    for (const child of Object.values(node.properties)) {
      enforceStrictObjectSchema(child);
    }
  }
  if (node.items) {
    if (Array.isArray(node.items)) {
      for (const item of node.items) enforceStrictObjectSchema(item);
    } else {
      enforceStrictObjectSchema(node.items);
    }
  }
  return node;
}

/**
 * ADR 0005's single source of truth, made concrete: one real JSON Schema
 * object, derived mechanically from the one Zod schema, consumed by both
 * adapters. Neither adapter is allowed to hand-write or fork this — the
 * Anthropic adapter wraps it as a tool's `input_schema`, the OpenAI adapter
 * passes it as a strict `response_format` schema, unchanged.
 *
 * No `name` option is passed to zod-to-json-schema: that mode wraps the
 * result in a `{ $ref, definitions }` envelope (meant for schema
 * registries), whereas both adapters need one flat, self-contained object
 * schema to hand a vendor API directly. `$refStrategy: "none"` inlines
 * every nested reference instead of producing internal `$ref`s a vendor's
 * structured-output validator may not resolve. The default (jsonSchema7)
 * target is used, not `openApi3` — Anthropic's `input_schema` and OpenAI's
 * `response_format` both expect plain JSON Schema, not OpenAPI's
 * `nullable: true` dialect, and TextPlanSchema has no nullable fields to
 * need it anyway.
 */
export const TEXT_PLAN_JSON_SCHEMA = enforceStrictObjectSchema(
  zodToJsonSchema(TextPlanSchema, { $refStrategy: "none" }) as JsonSchemaNode,
);
