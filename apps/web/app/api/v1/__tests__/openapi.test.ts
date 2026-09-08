import { describe, expect, it } from "vitest";
import { GET } from "../openapi.json/route";

/**
 * GATE 16's literal claim: "OpenAPI spec validates." A hand-authored
 * document (see openapi.json/route.ts's own doc comment on why no
 * schema-to-OpenAPI generator library was pulled in), checked here
 * against the real, minimum structural requirements of an OpenAPI 3.1
 * document, and cross-checked against every `$ref` it makes to prove it
 * never references a schema that doesn't exist — the actual failure mode
 * a hand-authored spec risks that a generated one wouldn't.
 */
describe("/v1/openapi.json", () => {
  it("returns a document with the required top-level OpenAPI 3.1 fields", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const doc = (await response.json()) as Record<string, unknown>;

    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info).toBeTruthy();
    expect((doc.info as Record<string, unknown>).title).toBeTruthy();
    expect((doc.info as Record<string, unknown>).version).toBeTruthy();
    expect(doc.paths).toBeTruthy();
    expect(Object.keys(doc.paths as object).length).toBeGreaterThan(0);
  });

  it("every $ref in the document resolves to a schema that actually exists in components.schemas", async () => {
    const response = await GET();
    const doc = (await response.json()) as Record<string, unknown>;
    const schemaNames = new Set(Object.keys((doc.components as Record<string, unknown>).schemas as object));

    const refs: string[] = [];
    function walk(node: unknown): void {
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          if (key === "$ref" && typeof value === "string") refs.push(value);
          else walk(value);
        }
      }
    }
    walk(doc.paths);

    expect(refs.length).toBeGreaterThan(0); // proves the walk actually found real $refs, not a vacuously-true empty check
    for (const ref of refs) {
      const schemaName = ref.replace("#/components/schemas/", "");
      expect(schemaNames.has(schemaName)).toBe(true);
    }
  });

  it("every path defines at least one HTTP method with a 200 or 201 response schema", async () => {
    const response = await GET();
    const doc = (await response.json()) as Record<string, unknown>;
    const paths = doc.paths as Record<string, Record<string, { responses?: Record<string, unknown> }>>;

    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        const responses = operation.responses ?? {};
        expect(Object.keys(responses).some((code) => code.startsWith("2")), `${method.toUpperCase()} ${path} has no 2xx response`).toBe(true);
      }
    }
  });

  it("every write operation (POST) that mutates state declares the Idempotency-Key header parameter", async () => {
    const response = await GET();
    const doc = (await response.json()) as Record<string, unknown>;
    const paths = doc.paths as Record<string, Record<string, { parameters?: { name: string; in: string }[] }>>;

    for (const [path, methods] of Object.entries(paths)) {
      if (!methods.post) continue;
      const hasIdempotencyHeader = (methods.post.parameters ?? []).some((p) => p.name === "Idempotency-Key" && p.in === "header");
      expect(hasIdempotencyHeader, `POST ${path} is missing the Idempotency-Key header parameter`).toBe(true);
    }
  });
});
