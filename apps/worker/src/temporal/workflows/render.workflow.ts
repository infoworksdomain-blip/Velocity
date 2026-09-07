import { proxyActivities } from "@temporalio/workflow";
import type { ComposeSpec, RenderResult, RenderWorkflowInput } from "@velocity/contracts";
import type * as activities from "../activities/index.js";

/**
 * The render pipeline (STEP 8.4): resolveAssets -> generateShots ->
 * generateVO -> align -> composeText -> compose -> normalise ->
 * provenance -> qc -> publishReady. Imports ONLY @temporalio/workflow +
 * @velocity/contracts — no db, no providers, no Node builtins — so the
 * workflow bundle stays deterministic and webpack-bundleable, per
 * Temporal's own requirement for workflow code.
 */

const MAX_REGENERATION_ROUNDS = 2;

const {
  generateShots,
  generateVo,
  align,
  composeText,
  compose,
  normalise,
  recordProvenance,
  runQcActivity,
  publishReady,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
  heartbeatTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});

const { resolveAssets: resolveAssetsShort } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 3 },
});

export async function renderWorkflow(input: RenderWorkflowInput): Promise<RenderResult> {
  let round = input.regenerationRound;

  for (;;) {
    const { formatPlan, primaryProviderId, promptHash } = await resolveAssetsShort(input);

    const shotOutputRefs = await generateShots(input.workspaceId, input.renderId, formatPlan, primaryProviderId, round);
    const voiceoverOutputRef = await generateVo(input.workspaceId, input.renderId, formatPlan, round);
    // Word-level timings for the caption track — real output, consumed by
    // apps/render's CaptionTrack component once a real render actually runs
    // (STEP 8B); this workflow only needs to pass the ref through today.
    const alignment = await align(input.workspaceId, input.renderId, formatPlan, voiceoverOutputRef);
    void alignment;
    const textResult = await composeText({
      workspaceId: input.workspaceId,
      renderId: input.renderId,
      contentConceptId: input.contentConceptId,
      textPlanId: input.textPlanId ?? input.renderId, // defensive fallback — render.start always resolves a real text_plans id before starting the workflow (see compose-text.ts's own module doc)
      storyboard: input.storyboard,
      format: input.format,
      targetPlatforms: input.targetPlatforms,
      regenerationRound: round,
      workspaceTier: input.workspaceTier,
      costCeilingUsd: input.costCeilingUsd,
    });

    const composeSpec: ComposeSpec = {
      shotOutputRefs,
      voiceoverOutputRef,
      textOverlayRef: textResult.textOverlayRef,
      targetResolution: formatPlan.targetResolution,
      targetDurationSec: formatPlan.targetDurationSec,
    };
    const compositionOutput = await compose(input.workspaceId, input.renderId, composeSpec);
    const normaliseResult = await normalise(input.workspaceId, input.renderId, compositionOutput.outputStorageKey);

    const provenanceResult = await recordProvenance({
      workspaceId: input.workspaceId,
      renderId: input.renderId,
      modelId: primaryProviderId,
      promptHash,
      outputStorageKey: normaliseResult.outputStorageKey,
    });

    const qcReport = await runQcActivity({
      workspaceId: input.workspaceId,
      renderId: input.renderId,
      hookText: formatPlan.shots[0]?.prompt ?? "",
      competitors: [],
      brandProfileId: null,
      widthPx: compositionOutput.widthPx,
      heightPx: compositionOutput.heightPx,
      durationMs: compositionOutput.durationMs,
      hasAudio: compositionOutput.hasAudio,
      requiresAudio: formatPlan.voiceover !== null,
      targetWidthPx: 1080,
      targetHeightPx: 1920,
      minDurationMs: 100,
      maxDurationMs: 120000,
      compositionDescriptor: JSON.stringify(composeSpec),
    });

    if (qcReport.verdict === "regenerate" && round < MAX_REGENERATION_ROUNDS) {
      round += 1;
      continue;
    }

    if (qcReport.verdict !== "pass") {
      return {
        renderId: input.renderId,
        outputStorageKey: null,
        costUsd: 0,
        qc: qcReport,
        provenance: {
          modelId: primaryProviderId,
          promptHash,
          aiGenerated: true,
          modelWatermarkPreserved: true,
          c2paManifestRef: provenanceResult.c2paManifestRef,
          c2paSigned: provenanceResult.c2paSigned,
        },
        status: "failed",
      };
    }

    await publishReady({
      workspaceId: input.workspaceId,
      renderId: input.renderId,
      contentItemId: input.contentItemId,
      outputStorageKey: normaliseResult.outputStorageKey,
      contentType: formatPlan.outputsImageSet ? "image/json-set" : "video/json-composition",
      sizeBytes: null,
      widthPx: compositionOutput.widthPx,
      heightPx: compositionOutput.heightPx,
      durationMs: compositionOutput.durationMs,
      requestedByUserId: input.workspaceId, // TODO(STEP-9): thread the real requesting user id through RenderWorkflowInput once Blitz swipe-right carries it
    });

    return {
      renderId: input.renderId,
      outputStorageKey: normaliseResult.outputStorageKey,
      costUsd: 0,
      qc: qcReport,
      provenance: {
        modelId: primaryProviderId,
        promptHash,
        aiGenerated: true,
        modelWatermarkPreserved: true,
        c2paManifestRef: provenanceResult.c2paManifestRef,
        c2paSigned: provenanceResult.c2paSigned,
      },
      status: "succeeded",
    };
  }
}
