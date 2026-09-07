import { publish } from "@velocity/core";
import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import { getKmsProvider, runInWorkspaceTx } from "../context.js";
import { claimPlatformInit, type PlatformInitHandle } from "./publish-step-ledger.js";

export interface PlatformInitActivityInput {
  workspaceId: string;
  publicationId: string;
  contentItemId: string;
  socialAccountId: string;
  platform: "tiktok" | "instagram" | "youtube";
  mediaUrl: string;
}

interface DecryptedCredentialPayload {
  accessToken: string;
  refreshMaterial: string;
  resourceId: string | null;
}

/**
 * Only video formats route through this pipeline (STEP 12) — TikTok photo
 * posts and Instagram carousels use different, unbuilt endpoints; a
 * content item in a photo/slideshow format reaching here is a real,
 * clear error, not a silent wrong-shaped call.
 */
const DEFAULT_VIDEO_CONTENT_TYPE = "video/mp4";

export async function platformInit(input: PlatformInitActivityInput): Promise<PlatformInitHandle> {
  return claimPlatformInit({ runInWorkspaceTx: (fn) => runInWorkspaceTx(input.workspaceId, fn), workspaceId: input.workspaceId, publicationId: input.publicationId, stepKind: "platform_init" }, async (db) => {
    const [credentialRow] = await db.select().from(schema.platformCredentials).where(eq(schema.platformCredentials.socialAccountId, input.socialAccountId)).limit(1);
    if (!credentialRow) throw new Error(`No platform credentials found for social account ${input.socialAccountId}`);
    const decrypted = JSON.parse(await getKmsProvider().decrypt(credentialRow.encryptedPayload, credentialRow.kmsKeyId)) as DecryptedCredentialPayload;

    const [contentItemRow] = await db
      .select({ hook: schema.contentConcepts.hook, aiGenerated: schema.contentItems.aiGenerated })
      .from(schema.contentItems)
      .innerJoin(schema.contentConcepts, eq(schema.contentConcepts.id, schema.contentItems.contentConceptId))
      .where(eq(schema.contentItems.id, input.contentItemId))
      .limit(1);
    if (!contentItemRow) throw new Error(`Content item ${input.contentItemId} not found`);

    switch (input.platform) {
      case "tiktok": {
        const handle = await publish.initTikTokPublish({ accessToken: decrypted.accessToken }, input.mediaUrl);
        return { externalJobId: handle.publishId, uploadTarget: null };
      }
      case "instagram": {
        if (!decrypted.resourceId) throw new Error(`Social account ${input.socialAccountId} has no linked Instagram business account id`);
        const handle = await publish.createInstagramContainer(
          { accessToken: decrypted.accessToken, instagramBusinessAccountId: decrypted.resourceId },
          input.mediaUrl,
          contentItemRow.hook,
          contentItemRow.aiGenerated,
        );
        return { externalJobId: handle.containerId, uploadTarget: null };
      }
      case "youtube": {
        const session = await publish.initYouTubeResumableSession(
          { accessToken: decrypted.accessToken },
          { title: contentItemRow.hook.slice(0, 100), description: contentItemRow.hook, containsSyntheticMedia: contentItemRow.aiGenerated },
          DEFAULT_VIDEO_CONTENT_TYPE,
        );
        return { externalJobId: session.uploadUrl, uploadTarget: session.uploadUrl };
      }
    }
  });
}
