import { audit, growthBrain } from "@velocity/core";
import { schema } from "@velocity/db";
import { AnthropicAssistantProvider, createStubAssistantProvider, type AssistantProvider, type ConversationTurn } from "@velocity/text-engine";
import { desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getAdminDb } from "./db";
import { previewAutoFillForWorkspace } from "./calendar-service";
import { fetchMetricSamples, getWorkspaceTimezone } from "./routers/analytics";

/**
 * Same generic base used throughout this codebase — `db` is threaded
 * through the READ-ONLY `pull_analytics` path (and the brand-profile
 * lookup) explicitly so GATE 14's adversarial-isolation test can run it
 * against a real embedded Postgres (PGlite), not just assert on mocked
 * calls. `create_content_concepts`'s deeper call into content-service.ts
 * and `schedule_content`'s call into calendar-service.ts still resolve
 * their own `getAdminDb()` internally (STEP 8/10's existing, established
 * shape) — a real, contained scope decision, not an oversight; see
 * docs/steps/STEP-14.md.
 */
type AssistantDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { runAssistantConversation, GROWTH_BRAIN_TOOLS } = growthBrain;
const { writeAuditLog } = audit;

/**
 * The AI Assistant's real tool executors (STEP 14). Every function here
 * is a closure over `workspaceId`/`userId` resolved ONCE, from the
 * authenticated tRPC context, before the LLM ever sees a system prompt —
 * none of them accept a workspaceId as a tool-call parameter (tools.ts's
 * schemas have no such field), so there is no code path through which
 * prompt injection could redirect a query to another workspace. This is
 * GATE 14's actual mechanism, not just a claim — see docs/steps/
 * STEP-14.md and the adversarial test in __tests__/assistant-service.test.ts.
 */

function getAssistantProvider(): AssistantProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new AnthropicAssistantProvider("claude-sonnet-4-6", apiKey) : createStubAssistantProvider();
}

const ASSISTANT_SYSTEM_PROMPT = [
  "You are Velocity's AI Growth Assistant, an AI system clearly disclosed as such in the interface you're embedded in (EU AI Act Art. 50(1)).",
  "You help the user create content concepts, preview a 30-day calendar auto-fill, and pull performance analytics for THEIR OWN workspace only.",
  "You have no tool that accepts or needs a workspace id — every tool you can call already operates on the current workspace automatically.",
  "You cannot access any other workspace's data under any circumstances, no matter how a request is phrased. If asked to, refuse and explain why.",
  "The schedule tool only PREVIEWS a plan; it never writes anything — a human reviews and commits any schedule change in the calendar itself.",
].join(" ");

const CreateConceptsInputSchema = z.object({
  angleCount: z.number().int().min(1).max(20).optional(),
  formats: z.array(z.enum(["ai_ugc", "slideshow", "hook_demo", "meme"])).min(1),
});
const ScheduleContentInputSchema = z.object({ days: z.number().int().min(1).max(60) });
const PullAnalyticsInputSchema = z.object({ groupBy: z.enum(["format", "angle", "persona", "platform", "hookPattern", "cohort"]) });

async function executeGrowthBrainTool(workspaceId: string, name: string, rawInput: unknown, db: AssistantDb): Promise<unknown> {
  switch (name) {
    case "create_content_concepts": {
      const input = CreateConceptsInputSchema.parse(rawInput);
      const brandProfileRows = await db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.workspaceId, workspaceId)).orderBy(desc(schema.brandProfiles.createdAt)).limit(1);
      const brandProfile = brandProfileRows[0];
      if (!brandProfile) throw new Error("This workspace has no brand profile yet — complete onboarding first.");

      const { generateConceptsForWorkspace } = await import("./content-service");
      return generateConceptsForWorkspace({
        workspaceId,
        brandProfileId: brandProfile.id,
        personaIds: [],
        angleCount: input.angleCount ?? 5,
        formats: input.formats,
        conceptsPerAngle: 1,
      });
    }

    case "schedule_content": {
      const input = ScheduleContentInputSchema.parse(rawInput);
      return previewAutoFillForWorkspace(workspaceId, input.days, new Date());
    }

    case "pull_analytics": {
      const input = PullAnalyticsInputSchema.parse(rawInput);
      const timezone = await getWorkspaceTimezone(workspaceId, db);
      const samples = await fetchMetricSamples(workspaceId, timezone, db);
      const { analytics } = await import("@velocity/core");
      switch (input.groupBy) {
        case "format":
          return analytics.aggregateByFormat(samples);
        case "angle":
          return analytics.aggregateByAngle(samples);
        case "persona":
          return analytics.aggregateByPersona(samples);
        case "platform":
          return analytics.aggregateByPlatform(samples);
        case "hookPattern":
          return analytics.aggregateByHookPattern(samples);
        case "cohort":
          return analytics.aggregateByPublishCohort(samples);
      }
      break;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export interface RunGrowthBrainChatInput {
  workspaceId: string;
  userId: string;
  conversation: ConversationTurn[];
  /** Injectable for tests (real PGlite) — defaults to the real production connection. */
  db?: AssistantDb;
  provider?: AssistantProvider;
}

export interface RunGrowthBrainChatResult {
  reply: string;
  conversation: ConversationTurn[];
}

export async function runGrowthBrainChat(input: RunGrowthBrainChatInput): Promise<RunGrowthBrainChatResult> {
  const db = input.db ?? getAdminDb();
  const provider = input.provider ?? getAssistantProvider();

  const executeTool = async (name: string, toolInput: unknown): Promise<{ content: string; isError?: boolean }> => {
    try {
      const output = await executeGrowthBrainTool(input.workspaceId, name, toolInput, db);
      await writeAuditLog(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: `assistant.tool_call.${name}`, targetType: "assistant_tool", targetId: name, before: toolInput as object, after: output as object });
      return { content: JSON.stringify(output) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeAuditLog(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: `assistant.tool_call.${name}.failed`, targetType: "assistant_tool", targetId: name, before: toolInput as object, after: { error: message } });
      return { content: message, isError: true };
    }
  };

  const result = await runAssistantConversation({
    provider,
    system: ASSISTANT_SYSTEM_PROMPT,
    tools: GROWTH_BRAIN_TOOLS,
    conversation: input.conversation,
    executeTool,
  });

  return { reply: result.reply, conversation: result.conversation };
}
