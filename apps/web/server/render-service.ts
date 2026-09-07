import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
// @velocity/worker has no "exports" restriction (like @velocity/db) — this
// reaches its compiled Temporal client directly, the same pattern used for
// @velocity/db's testing subpath.
import { startRenderWorkflow } from "@velocity/worker/dist/temporal/client.js";
import { and, eq } from "drizzle-orm";
import { getAdminDb } from "./db";

const DEFAULT_COST_CEILING_USD = 5;

export interface TriggerRenderInput {
  workspaceId: string;
  userId: string;
  contentConceptId: string;
  workspaceTier: string;
}

export interface TriggerRenderResult {
  renderId: string;
  workflowId: string;
}

/**
 * The actual "trigger Tier-2 full render" mechanism (build script STEP 9:
 * "Tier 2: full render — triggered only on swipe-right"). Extracted out of
 * routers/render.ts's `start` mutation so both that endpoint (still real —
 * a direct-render demo/debug path) and routers/velocity.ts's swipe-right
 * handler call the exact same logic, rather than the swipe path
 * re-implementing content_item creation and risking it drifting from the
 * render router's own C7-approval-event semantics.
 */
export async function triggerRenderForConcept(input: TriggerRenderInput): Promise<TriggerRenderResult> {
  const db = getAdminDb();

  const conceptRows = await db
    .select()
    .from(schema.contentConcepts)
    .where(and(eq(schema.contentConcepts.id, input.contentConceptId), eq(schema.contentConcepts.workspaceId, input.workspaceId)))
    .limit(1);
  const concept = conceptRows[0];
  if (!concept) throw new Error(`Content concept ${input.contentConceptId} not found in workspace ${input.workspaceId}`);

  const storyboardRows = await db.select().from(schema.storyboards).where(eq(schema.storyboards.contentConceptId, concept.id)).limit(1);
  const storyboard = storyboardRows[0];
  if (!storyboard) throw new Error(`Concept ${concept.id} has no storyboard`);

  // content_items.textPlanId is NOT NULL — STEP 9's own concept-generation
  // integration (content-service.ts) makes this real for every concept
  // generated after that change landed; a placeholder still covers any
  // concept generated before it (or via a degraded no-text-provider path).
  let textPlanId = concept.textPlanId;
  if (!textPlanId) {
    textPlanId = randomUUID();
    await db.insert(schema.textPlans).values({ id: textPlanId, workspaceId: input.workspaceId, version: "1.0", plan: { placeholder: true } });
  }

  // C7: human approval before publish. The swipe-right gesture itself IS
  // the recorded approval event — creating this content_items row through
  // this authenticated path is that event, same as routers/render.ts's
  // direct-render path.
  const contentItemId = randomUUID();
  await db.insert(schema.contentItems).values({
    id: contentItemId,
    workspaceId: input.workspaceId,
    contentConceptId: concept.id,
    textPlanId,
    status: "queued",
    approvedByUserId: input.userId,
    approvedAt: new Date(),
  });

  const renderId = randomUUID();
  const { workflowId } = await startRenderWorkflow({
    renderId,
    workspaceId: input.workspaceId,
    contentItemId,
    contentConceptId: concept.id,
    format: concept.format,
    storyboard: { scenes: storyboard.scenes },
    textPlanId,
    personaId: concept.personaId,
    workspaceTier: input.workspaceTier,
    costCeilingUsd: DEFAULT_COST_CEILING_USD,
    regenerationRound: 0,
    targetPlatforms: ["tiktok", "reels", "shorts"],
  });

  return { renderId, workflowId };
}
