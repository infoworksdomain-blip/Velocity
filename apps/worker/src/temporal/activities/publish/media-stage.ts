import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import { getBlobStore, runInWorkspaceTx } from "../context.js";
import { runIdempotentStep } from "./publish-step-ledger.js";

export interface MediaStageInput {
  workspaceId: string;
  publicationId: string;
  renderId: string;
}

/**
 * The build script's literal `mediaStage` step — resolves the render's
 * output to a publicly-reachable URL. All three platforms' publish flows
 * need this: TikTok's `PULL_FROM_URL` source, Instagram's `video_url`
 * container field, and (indirectly) this pipeline's own upload step for
 * YouTube all require the media to be fetchable from outside this
 * process, not just present in the blob store.
 */
export async function mediaStage(input: MediaStageInput): Promise<{ mediaUrl: string }> {
  return runIdempotentStep({ runInWorkspaceTx: (fn) => runInWorkspaceTx(input.workspaceId, fn), workspaceId: input.workspaceId, publicationId: input.publicationId, stepKind: "media_stage" }, async (db) => {
    const [renderRow] = await db.select().from(schema.renders).where(eq(schema.renders.id, input.renderId)).limit(1);
    if (!renderRow?.outputStorageKey) throw new Error(`Render ${input.renderId} has no output to stage`);
    const mediaUrl = await getBlobStore().signedUrl(renderRow.outputStorageKey);
    return { mediaUrl };
  });
}
