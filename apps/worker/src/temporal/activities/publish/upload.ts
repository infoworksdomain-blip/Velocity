import { publish } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import { getBlobStore, runInWorkspaceTx } from "../context.js";
import { runIdempotentStep } from "./publish-step-ledger.js";

export interface UploadActivityInput {
  workspaceId: string;
  publicationId: string;
  renderId: string;
  platform: "tiktok" | "instagram" | "youtube";
}

export interface UploadResult {
  videoId: string | null;
}

/**
 * TikTok's `PULL_FROM_URL` and Instagram's `video_url` container field
 * both already told the platform where to fetch the media — platformInit
 * WAS the upload trigger for those two, so this step is a real no-op for
 * them. Only YouTube's resumable protocol needs an explicit PUT of the
 * bytes to the session URI platformInit obtained.
 */
export async function upload(input: UploadActivityInput): Promise<UploadResult> {
  return runIdempotentStep({ runInWorkspaceTx: (fn) => runInWorkspaceTx(input.workspaceId, fn), workspaceId: input.workspaceId, publicationId: input.publicationId, stepKind: "upload" }, async (db) => {
    if (input.platform !== "youtube") return { videoId: null };

    const [initStep] = await db
      .select()
      .from(schema.publicationSteps)
      .where(and(eq(schema.publicationSteps.publicationId, input.publicationId), eq(schema.publicationSteps.stepKey, "platform_init")))
      .limit(1);
    if (!initStep?.uploadTarget) throw new Error(`Publication ${input.publicationId} has no YouTube upload session — platformInit must run first`);

    const [renderRow] = await db.select().from(schema.renders).where(eq(schema.renders.id, input.renderId)).limit(1);
    if (!renderRow?.outputStorageKey) throw new Error(`Render ${input.renderId} has no output to upload`);
    const bytes = await getBlobStore().get(renderRow.outputStorageKey);
    if (!bytes) throw new Error(`Render output ${renderRow.outputStorageKey} not found in blob store`);

    const result = await publish.uploadYouTubeVideo({ uploadUrl: initStep.uploadTarget }, bytes, "video/mp4");
    return { videoId: result.videoId };
  });
}
