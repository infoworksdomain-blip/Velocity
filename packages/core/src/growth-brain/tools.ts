import type { AssistantTool } from "@velocity/text-engine";

/**
 * The AI Assistant's three real tools (STEP 14: "tool access to create
 * concepts, schedule and pull analytics"). Deliberately no `workspaceId`
 * field in ANY input schema — GATE 14's "the assistant cannot reach
 * another workspace's data" holds because there is no legitimate way for
 * a tool call's input to carry one; the real executor (apps/web) always
 * sources workspaceId from the authenticated tRPC context, never from
 * the LLM's own tool-call arguments. This is enforced at the schema
 * level here and at the executor level in apps/web/server/assistant-
 * service.ts — two independent layers, not one.
 */

/**
 * No `brandProfileId` field — deliberately. `generateConceptsForWorkspace`
 * (apps/web/server/content-service.ts, STEP 8) takes one as a parameter
 * but never validates it belongs to the calling workspace; that was never
 * exploitable while only a trusted, UI-selected id ever reached it, but
 * accepting it here as LLM-authored tool input would hand an adversarial
 * prompt a real cross-tenant read (generate concepts FROM another
 * workspace's brand profile — a genuine C4 violation). The executor
 * (assistant-service.ts) resolves the calling workspace's OWN brand
 * profile server-side instead — there is no field in this schema an
 * injection could use to point elsewhere.
 */
export const CREATE_CONTENT_CONCEPTS_TOOL: AssistantTool = {
  name: "create_content_concepts",
  description: "Generate new short-form content concepts for this workspace's own brand profile and angles. Returns the generated concepts and their cost.",
  inputSchema: {
    type: "object",
    properties: {
      angleCount: { type: "integer", minimum: 1, maximum: 20, description: "How many marketing angles to generate concepts across." },
      formats: { type: "array", items: { type: "string", enum: ["ai_ugc", "slideshow", "hook_demo", "meme"] }, description: "Which content formats to generate." },
    },
    required: ["formats"],
  },
};

export const SCHEDULE_CONTENT_TOOL: AssistantTool = {
  name: "schedule_content",
  description: "Auto-fill the next N days of this workspace's calendar with its own ready content, respecting platform caps, spacing, and rotation rules. Returns what was scheduled.",
  inputSchema: {
    type: "object",
    properties: {
      days: { type: "integer", minimum: 1, maximum: 60, description: "How many days ahead to schedule." },
    },
    required: ["days"],
  },
};

export const PULL_ANALYTICS_TOOL: AssistantTool = {
  name: "pull_analytics",
  description: "Pull this workspace's own real performance analytics, grouped by a dimension.",
  inputSchema: {
    type: "object",
    properties: {
      groupBy: { type: "string", enum: ["format", "angle", "persona", "platform", "hookPattern", "cohort"], description: "Which dimension to group performance by." },
    },
    required: ["groupBy"],
  },
};

export const GROWTH_BRAIN_TOOLS: AssistantTool[] = [CREATE_CONTENT_CONCEPTS_TOOL, SCHEDULE_CONTENT_TOOL, PULL_ANALYTICS_TOOL];
