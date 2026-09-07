import { publish } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import { getKmsProvider, runInWorkspaceTx } from "../context.js";
import { runIdempotentStep } from "./publish-step-ledger.js";

export interface ConfirmActivityInput {
  workspaceId: string;
  publicationId: string;
  socialAccountId: string;
  platform: "tiktok" | "instagram" | "youtube";
  /** YouTube: poll's own terminal state already IS the post id — nothing left to confirm. TikTok: real, but may legitimately be null (Upload/draft mode's SEND_TO_USER_INBOX success state has no public post id — see below). Instagram: always null coming in, because a FINISHED container has not been published yet. */
  platformPostIdFromPoll: string | null;
}

interface DecryptedCredentialPayload {
  accessToken: string;
  refreshMaterial: string;
  resourceId: string | null;
}

/**
 * Instagram's real "make it live" call — `media_publish` — is the one
 * genuinely dangerous-to-double-call step in this pipeline: unlike
 * TikTok/YouTube where the poll's terminal state already implies the
 * post exists, a container reaching FINISHED has NOT posted anything
 * yet. Memoized via the ledger so a retried confirm activity never
 * calls media_publish twice for the same publication.
 */
export async function confirm(input: ConfirmActivityInput): Promise<{ platformPostId: string | null }> {
  return runIdempotentStep({ runInWorkspaceTx: (fn) => runInWorkspaceTx(input.workspaceId, fn), workspaceId: input.workspaceId, publicationId: input.publicationId, stepKind: "confirm" }, async (db) => {
    if (input.platform !== "instagram") {
      // TikTok's Upload/draft mode has no public post id even on success —
      // SEND_TO_USER_INBOX means the video reached the creator's inbox as a
      // draft, not that it's live (see adapters/tiktok-publish.ts). A null
      // id here is the documented, correct outcome for that mode, not a
      // missing value to reject.
      return { platformPostId: input.platformPostIdFromPoll };
    }

    const [credentialRow] = await db.select().from(schema.platformCredentials).where(eq(schema.platformCredentials.socialAccountId, input.socialAccountId)).limit(1);
    if (!credentialRow) throw new Error(`No platform credentials found for social account ${input.socialAccountId}`);
    const decrypted = JSON.parse(await getKmsProvider().decrypt(credentialRow.encryptedPayload, credentialRow.kmsKeyId)) as DecryptedCredentialPayload;
    if (!decrypted.resourceId) throw new Error(`Social account ${input.socialAccountId} has no linked Instagram business account id`);

    const [initStep] = await db
      .select()
      .from(schema.publicationSteps)
      .where(and(eq(schema.publicationSteps.publicationId, input.publicationId), eq(schema.publicationSteps.stepKey, "platform_init")))
      .limit(1);
    if (!initStep?.externalJobId) throw new Error(`Publication ${input.publicationId} has no Instagram container id — platformInit must run first`);

    const result = await publish.publishInstagramContainer({ accessToken: decrypted.accessToken, instagramBusinessAccountId: decrypted.resourceId }, { containerId: initStep.externalJobId });
    return { platformPostId: result.mediaId };
  });
}
