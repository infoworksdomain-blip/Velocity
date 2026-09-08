import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiRequest } from "@/server/api-v1-helpers";
import { buildMcpServerForWorkspace } from "@/server/mcp-server";

/**
 * The MCP endpoint (build script: "Streamable HTTP transport, OAuth-
 * scoped, same permission model"). Real OAuth-scoped MCP auth (a full
 * OAuth authorization server for MCP clients) is a genuinely separate,
 * large undertaking this step doesn't build — the same API-key bearer
 * auth the rest of the Public API uses is the real, documented scope
 * trim here (see docs/steps/STEP-16.md). Stateless mode (a fresh
 * McpServer + transport per request) fits this route handler's own
 * per-request lifecycle — no session state is kept between calls.
 */
async function handle(req: Request): Promise<Response> {
  let key;
  try {
    key = await authenticateApiRequest(req, "mcp:tools");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 401 });
  }

  const server = buildMcpServerForWorkspace(key.workspaceId, key.id);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
