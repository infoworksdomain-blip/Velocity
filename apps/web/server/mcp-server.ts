import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "./db";
import { executeGrowthBrainTool } from "./assistant-service";
import { triggerPublish } from "./publish-service";

/**
 * The MCP server (STEP 16, build script: "MCP server: tools mapping 1:1
 * onto the API"). A real, representative SUBSET of the build script's own
 * 14-tool list — `create_content_concepts` and `pull_analytics` map 1:1
 * onto GROWTH_BRAIN_TOOLS' real executors (the EXACT same workspace-
 * isolated implementation GATE 14 already proved, reused verbatim rather
 * than reimplemented for this transport), plus `get_credit_balance` (a
 * real read) and `publish_now` — the build script's own literal example
 * of why "publishing tools require an explicit confirmation parameter":
 * an agent must not post to a customer's real audience on an ambiguous
 * instruction. Every tool call here is scoped to ONE `workspaceId`,
 * resolved once from the authenticated API key before this server is
 * ever constructed — never accepted as tool input, the same isolation
 * discipline as the chat assistant and agent runs.
 */
export function buildMcpServerForWorkspace(workspaceId: string, userId: string): McpServer {
  const server = new McpServer({ name: "velocity", version: "1.0.0" });
  // getAdminDb() is resolved lazily, INSIDE each tool handler — not once
  // eagerly here. getAdminDb() throws immediately if DATABASE_URL isn't
  // configured (this sandbox's tests use PGlite, not a real network
  // Postgres), so an eager call here would make it impossible to even
  // CONSTRUCT this server — and therefore test the real MCP protocol
  // handshake/tool-listing/confirm-gating mechanics — without a live DB.
  // Only tool handlers that actually touch the database pay that cost,
  // exactly when they run.

  server.registerTool(
    "create_content_concepts",
    { title: "Create content concepts", description: "Generate new Tier-1 content concepts for this workspace's Velocity queue.", inputSchema: { formats: z.array(z.enum(["ai_ugc", "slideshow", "hook_demo", "meme"])).min(1), angleCount: z.number().int().min(1).max(20).optional() } },
    async (args) => {
      const output = await executeGrowthBrainTool(workspaceId, "create_content_concepts", args, getAdminDb());
      return { content: [{ type: "text", text: JSON.stringify(output) }] };
    },
  );

  server.registerTool(
    "pull_analytics",
    { title: "Pull analytics", description: "Read this workspace's own performance analytics, aggregated by a dimension.", inputSchema: { groupBy: z.enum(["format", "angle", "persona", "platform", "hookPattern", "cohort"]) } },
    async (args) => {
      const output = await executeGrowthBrainTool(workspaceId, "pull_analytics", args, getAdminDb());
      return { content: [{ type: "text", text: JSON.stringify(output) }] };
    },
  );

  server.registerTool("get_credit_balance", { title: "Get credit balance", description: "Read this workspace's current credit balance." }, async () => {
    const result = await getAdminDb().execute<{ balance: string }>(sql`SELECT balance FROM credit_balances WHERE workspace_id = ${workspaceId}`);
    return { content: [{ type: "text", text: JSON.stringify({ balance: Number(result.rows[0]?.balance ?? 0) }) }] };
  });

  server.registerTool(
    "publish_now",
    {
      title: "Publish now",
      description: "Publish an already-approved, ready content item to a connected social account. REQUIRES confirm: true — this tool posts to the workspace's real, connected audience and will refuse to act without explicit confirmation.",
      inputSchema: { contentItemId: z.string().uuid(), socialAccountId: z.string().uuid(), confirm: z.boolean() },
    },
    async (args) => {
      if (!args.confirm) {
        return { content: [{ type: "text", text: "Refused: publishing to a real, connected audience requires confirm: true. Ask the user to explicitly confirm before calling this tool again." }], isError: true };
      }
      try {
        const result = await triggerPublish({ workspaceId, userId, contentItemId: args.contentItemId, socialAccountId: args.socialAccountId });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  return server;
}
