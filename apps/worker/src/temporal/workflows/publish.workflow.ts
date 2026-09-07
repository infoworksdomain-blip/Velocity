import { proxyActivities } from "@temporalio/workflow";
import type { PublishFailureKind, PublishResult, PublishWorkflowInput } from "@velocity/contracts";
import type * as activities from "../activities/index.js";

/**
 * The publish pipeline (STEP 12): preflight -> mediaStage -> platformInit
 * -> upload -> poll -> confirm -> record, the build script's own literal
 * step names. Imports ONLY @temporalio/workflow + @velocity/contracts —
 * no db, no providers, no Node builtins — same discipline as
 * render.workflow.ts, for the same reason (Temporal's own bundler
 * requirement for deterministic, webpack-bundleable workflow code).
 */

const { preflightCheck, mediaStage, platformInit, upload, confirm, record } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 5 },
});

// A longer ceiling than the other steps — poll runs its own internal
// bounded loop against a real vendor's async processing, which can
// legitimately take longer than a single fast API call.
const { poll } = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
  retry: { maximumAttempts: 3 },
});

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function publishWorkflow(input: PublishWorkflowInput): Promise<PublishResult> {
  const baseRecordInput = {
    workspaceId: input.workspaceId,
    publicationId: input.publicationId,
    contentItemId: input.contentItemId,
    renderId: input.renderId,
    platform: input.platform,
    requestedByUserId: input.requestedByUserId,
  };

  const preflightResult = await preflightCheck({
    workspaceId: input.workspaceId,
    publicationId: input.publicationId,
    contentItemId: input.contentItemId,
    renderId: input.renderId,
    socialAccountId: input.socialAccountId,
    platform: input.platform,
  });

  if (!preflightResult.passed) {
    return record({
      ...baseRecordInput,
      status: "failed",
      platformPostId: null,
      failureKind: preflightResult.failureKind,
      errorMessage: preflightResult.reasons.join("; "),
    });
  }

  // Any activity failure past this point, after Temporal's own retries are exhausted, is treated as terminal — the quota-specific outcome is only ever produced by preflight, before any vendor call is made.
  const failureKind: PublishFailureKind = "terminal";
  try {
    const { mediaUrl } = await mediaStage({ workspaceId: input.workspaceId, publicationId: input.publicationId, renderId: input.renderId });
    await platformInit({ workspaceId: input.workspaceId, publicationId: input.publicationId, contentItemId: input.contentItemId, socialAccountId: input.socialAccountId, platform: input.platform, mediaUrl });
    await upload({ workspaceId: input.workspaceId, publicationId: input.publicationId, renderId: input.renderId, platform: input.platform });

    const pollResult = await poll({ workspaceId: input.workspaceId, publicationId: input.publicationId, socialAccountId: input.socialAccountId, platform: input.platform });
    if (pollResult.state === "failed") {
      return record({ ...baseRecordInput, status: "failed", platformPostId: null, failureKind: "terminal", errorMessage: pollResult.errorMessage ?? "Publish poll reported failure with no reason given" });
    }

    const confirmResult = await confirm({
      workspaceId: input.workspaceId,
      publicationId: input.publicationId,
      socialAccountId: input.socialAccountId,
      platform: input.platform,
      platformPostIdFromPoll: pollResult.platformPostId,
    });

    return record({ ...baseRecordInput, status: "published", platformPostId: confirmResult.platformPostId, failureKind: null, errorMessage: null });
  } catch (error) {
    return record({ ...baseRecordInput, status: "failed", platformPostId: null, failureKind, errorMessage: errorMessageOf(error) });
  }
}
