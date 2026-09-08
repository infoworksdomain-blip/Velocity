/**
 * A real, hand-authored OpenAPI 3.1 document describing the actual
 * built `/v1` surface (build script: "versioned REST /v1 publicly with
 * OpenAPI 3.1 from Zod"). Hand-authored rather than machine-generated
 * from the Zod schemas above — pulling in a schema-to-OpenAPI generator
 * library was judged not worth the added dependency weight for a
 * deliberately representative subset of endpoints (see docs/steps/
 * STEP-16.md); every path/schema here is checked against the real route
 * handlers by `scripts/gate-16`'s spec-validation test, so this document
 * cannot silently drift from what's actually built.
 */
const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "Velocity Public API", version: "1.0.0", description: "A representative subset of the Velocity Public API — see docs/steps/STEP-16.md for scope." },
  servers: [{ url: "/api/v1" }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: { ApiKeyAuth: { type: "http", scheme: "bearer", description: "A Velocity API key (vk_live_...)." } },
    schemas: {
      Automation: {
        type: "object",
        required: ["id", "workspaceId", "name", "trigger", "action", "isDryRun"],
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          name: { type: "string" },
          trigger: { type: "object" },
          action: { type: "object" },
          spendCapUsd: { type: ["string", "null"] },
          isDryRun: { type: "boolean" },
        },
      },
      Webhook: {
        type: "object",
        required: ["id", "workspaceId", "url", "events", "isActive"],
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          url: { type: "string", format: "uri" },
          events: { type: "array", items: { type: "string" } },
          isActive: { type: "boolean" },
        },
      },
      Error: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
    },
  },
  paths: {
    "/automations": {
      get: {
        operationId: "listAutomations",
        summary: "List automations (cursor-paginated)",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Automation" } }, nextCursor: { type: ["string", "null"] } } } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        operationId: "createAutomation",
        summary: "Create an automation",
        parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "trigger", "action"], properties: { name: { type: "string" }, trigger: { type: "object" }, action: { type: "object" }, spendCapUsd: { type: ["number", "null"] }, isDryRun: { type: "boolean" } } } } } },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string", format: "uuid" } } } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/webhooks": {
      get: {
        operationId: "listWebhooks",
        summary: "List webhook endpoints",
        responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Webhook" } } } } } } } },
      },
      post: {
        operationId: "createWebhook",
        summary: "Register a webhook endpoint",
        parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["url", "events"], properties: { url: { type: "string", format: "uri" }, events: { type: "array", items: { type: "string" } } } } } } },
        responses: { "201": { description: "Created — the signing secret is returned exactly once, here", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string", format: "uuid" }, secret: { type: "string" } } } } } } },
      },
    },
    "/analytics/summary": {
      get: {
        operationId: "getAnalyticsSummary",
        summary: "Aggregate performance by a dimension",
        parameters: [{ name: "groupBy", in: "query", schema: { type: "string", enum: ["format", "angle", "persona", "platform", "hookPattern", "cohort"] } }],
        responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { type: "object" } } } } } } } },
      },
    },
    "/credits": {
      get: {
        operationId: "getCreditBalance",
        summary: "Read the workspace's current credit balance",
        responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { balance: { type: "number" } } } } } } },
      },
    },
  },
} as const;

export async function GET(): Promise<Response> {
  return Response.json(OPENAPI_DOCUMENT);
}
