import { provenance } from "@velocity/core";
import type { FormatPlan, RenderWorkflowInput } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import { buildFormatPlan } from "../formats/index.js";
import { getCircuitBreaker, getProviderRegistry, runInWorkspaceTx } from "./context.js";
import { selectOne } from "@velocity/providers";

/**
 * The workflow's first activity (STEP 8.4). Selects the primary provider
 * for the format's main capability (video for ai_ugc/hook_demo, image for
 * slideshow/meme), computes the prompt hash, and inserts the `renders` row
 * — idempotently: `renderId` is pre-allocated by the caller before the
 * workflow starts (it's also the Temporal workflow id), so a retried
 * resolveAssets just no-ops on the insert and re-reads the same row,
 * rather than allocating a second render for one workflow execution.
 */
export interface ResolveAssetsResult {
  formatPlan: FormatPlan;
  primaryProviderId: string;
  primaryModelId: string;
  promptHash: string;
}

export async function resolveAssets(input: RenderWorkflowInput): Promise<ResolveAssetsResult> {
  const requiresVideo = input.format === "ai_ugc" || input.format === "hook_demo";
  const kind = requiresVideo ? ("video" as const) : ("image" as const);

  const registry = getProviderRegistry();
  const breaker = getCircuitBreaker();
  const { selection } = await selectOne(registry, breaker, {
    kind,
    workspaceTier: input.workspaceTier,
    costCeilingUsd: input.costCeilingUsd,
    required: { commercialUse: true },
    jobShape: requiresVideo
      ? { durationSec: input.storyboard.scenes.reduce((s, sc) => s + sc.durationMs, 0) / 1000 }
      : { imageCount: input.storyboard.scenes.length },
  });

  const referenceImageUrl = await runInWorkspaceTx(input.workspaceId, async (db) => {
    if (!input.personaId) return null;
    const rows = await db.select({ ref: schema.personas.referenceImageStorageKey }).from(schema.personas).where(eq(schema.personas.id, input.personaId)).limit(1);
    return rows[0]?.ref ?? null;
  });

  const formatPlan = buildFormatPlan(input.format, input.storyboard, referenceImageUrl);

  const promptHash = provenance.promptHash({
    storyboard: input.storyboard,
    textPlanId: input.textPlanId,
    personaId: input.personaId,
    format: input.format,
  });

  await runInWorkspaceTx(input.workspaceId, async (db) => {
    await db
      .insert(schema.renders)
      .values({
        id: input.renderId,
        workspaceId: input.workspaceId,
        contentItemId: input.contentItemId,
        status: "running",
        providerId: selection.providerId,
        modelId: selection.providerId,
        promptHash,
        formatPlan,
      })
      .onConflictDoNothing({ target: schema.renders.id });
  });

  return { formatPlan, primaryProviderId: selection.providerId, primaryModelId: selection.providerId, promptHash };
}
