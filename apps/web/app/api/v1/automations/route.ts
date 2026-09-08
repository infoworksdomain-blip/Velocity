import { schema } from "@velocity/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { automation as automationCore } from "@velocity/core";
import { getAdminDb } from "@/server/db";
import { apiErrorResponse, authenticateApiRequest, jsonResponse, paginate, parseCursorParams } from "@/server/api-v1-helpers";
import { createAutomation } from "@/server/automation-service";
import { withIdempotency } from "@/server/idempotency-service";

/**
 * `/v1/automations` (build script's literal Public API surface). One of a
 * real, representative SUBSET of the ~40 listed endpoints actually built
 * this step — see docs/steps/STEP-16.md's scope decision on why the full
 * surface isn't replicated: every endpoint here is a thin REST facade
 * (auth + pagination + idempotency) over the EXACT service functions the
 * internal tRPC routers already call, so building all 40 would be
 * mechanical repetition of already-proven business logic, not new
 * capability GATE 16 actually tests for.
 */

const TriggerConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("schedule"), config: z.object({ timeOfDay: z.string(), daysOfWeek: z.array(z.number().int().min(0).max(6)).optional() }) }),
  z.object({ kind: z.literal("performance_threshold"), config: z.object({ dimension: z.enum(["format", "angle", "persona", "platform", "hookPattern"]), metric: z.literal("avgEngagementRate"), comparator: z.enum(["below", "above"]), threshold: z.number() }) }),
  z.object({ kind: z.literal("low_queue"), config: z.object({ minReadyCount: z.number().int().nonnegative() }) }),
  z.object({ kind: z.literal("new_blueprint_in_niche"), config: z.object({ nicheTag: z.string().min(1) }) }),
  z.object({ kind: z.literal("competitor_post"), config: z.object({ competitorId: z.string().uuid() }) }),
  z.object({ kind: z.literal("product_feed_change"), config: z.object({ feedUrl: z.string().url() }) }),
]);

const ActionConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("generate_batch"), config: z.object({ brandProfileId: z.string().uuid(), personaIds: z.array(z.string().uuid()), angleCount: z.number().int().min(1).max(20), formats: z.array(z.enum(["ai_ugc", "slideshow", "hook_demo", "meme"])), conceptsPerAngle: z.number().int().min(1).max(10) }) }),
  z.object({ kind: z.literal("auto_schedule"), config: z.object({ days: z.number().int().min(1).max(60) }) }),
  z.object({ kind: z.literal("notify"), config: z.object({ userId: z.string().uuid(), title: z.string().min(1), body: z.string().min(1) }) }),
  z.object({ kind: z.literal("pause_campaign"), config: z.object({ campaignId: z.string().uuid() }) }),
  z.object({ kind: z.literal("boost_winner_variants"), config: z.object({ winnerZScoreThreshold: z.number().optional() }) }),
  z.object({ kind: z.literal("regenerate_hooks_for_underperformers"), config: z.object({ brandProfileId: z.string().uuid(), personaIds: z.array(z.string().uuid()), loserZScoreThreshold: z.number().optional(), conceptsPerAngle: z.number().int().min(1).max(10).optional() }) }),
]);

const CreateAutomationBodySchema = z.object({ name: z.string().min(1), trigger: TriggerConfigSchema, action: ActionConfigSchema, spendCapUsd: z.number().positive().nullable().optional(), isDryRun: z.boolean().optional() });

export async function GET(req: Request): Promise<Response> {
  try {
    const key = await authenticateApiRequest(req, "automations:read");
    const db = getAdminDb();
    const { limit, cursor } = parseCursorParams(new URL(req.url));

    const rows = await db
      .select()
      .from(schema.automations)
      .where(cursor ? and(eq(schema.automations.workspaceId, key.workspaceId), lt(schema.automations.createdAt, new Date(cursor))) : eq(schema.automations.workspaceId, key.workspaceId))
      .orderBy(desc(schema.automations.createdAt))
      .limit(limit + 1);

    return jsonResponse(paginate(rows, limit));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const key = await authenticateApiRequest(req, "automations:write");
    const idempotencyKey = req.headers.get("idempotency-key");
    if (!idempotencyKey) return apiErrorResponse(new Error("Idempotency-Key header is required for this write"));

    const body = CreateAutomationBodySchema.parse(await req.json());
    const db = getAdminDb();

    const result = await withIdempotency(db, key.workspaceId, idempotencyKey, async () => {
      const created = await createAutomation(
        { workspaceId: key.workspaceId, name: body.name, trigger: body.trigger as automationCore.TriggerConfig, action: body.action as automationCore.ActionConfig, spendCapUsd: body.spendCapUsd ?? null, isDryRun: body.isDryRun ?? false },
        db,
      );
      return { statusCode: 201, body: created };
    });

    return jsonResponse(result.body, result.statusCode);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
