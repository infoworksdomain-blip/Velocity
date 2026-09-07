import { publish } from "@velocity/core";
import type { PublishPollResult } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import { getKmsProvider, runInWorkspaceTx } from "../context.js";

export interface PollActivityInput {
  workspaceId: string;
  publicationId: string;
  socialAccountId: string;
  platform: "tiktok" | "instagram" | "youtube";
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface DecryptedCredentialPayload {
  accessToken: string;
  refreshMaterial: string;
  resourceId: string | null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read-only by nature (a status GET/POST, never a state-creating call) —
 * unlike platformInit, re-polling after a crash is always safe, so this
 * step deliberately isn't routed through the ledger's claim mechanism.
 * Reads the externalJobId platformInit persisted (and, for YouTube, the
 * videoId the upload step persisted) in short, separate DB round-trips
 * BEFORE the poll loop starts — never inside it. A real vendor poll can
 * legitimately take a while; holding a Postgres transaction open for
 * that whole loop is the exact anti-pattern step-ledger.ts's own
 * `withStep` documents avoiding, applied here too.
 */
export async function poll(input: PollActivityInput): Promise<PublishPollResult> {
  const [credentialRow] = await runInWorkspaceTx(input.workspaceId, (db) => db.select().from(schema.platformCredentials).where(eq(schema.platformCredentials.socialAccountId, input.socialAccountId)).limit(1));
  if (!credentialRow) throw new Error(`No platform credentials found for social account ${input.socialAccountId}`);
  const decrypted = JSON.parse(await getKmsProvider().decrypt(credentialRow.encryptedPayload, credentialRow.kmsKeyId)) as DecryptedCredentialPayload;

  const [initStep] = await runInWorkspaceTx(input.workspaceId, (db) =>
    db
      .select()
      .from(schema.publicationSteps)
      .where(and(eq(schema.publicationSteps.publicationId, input.publicationId), eq(schema.publicationSteps.stepKey, "platform_init")))
      .limit(1),
  );
  if (!initStep?.externalJobId) throw new Error(`Publication ${input.publicationId} has no platform_init handle — platformInit must run first`);

  let videoId: string | null = null;
  if (input.platform === "youtube") {
    const [uploadStep] = await runInWorkspaceTx(input.workspaceId, (db) =>
      db
        .select()
        .from(schema.publicationSteps)
        .where(and(eq(schema.publicationSteps.publicationId, input.publicationId), eq(schema.publicationSteps.stepKey, "upload")))
        .limit(1),
    );
    videoId = (uploadStep?.output as { videoId: string | null } | undefined)?.videoId ?? null;
    if (!videoId) throw new Error(`Publication ${input.publicationId} has no YouTube video id — upload must run first`);
  }

  const pollIntervalMs = input.pollIntervalMs ?? 25;
  const maxPollAttempts = input.maxPollAttempts ?? 400;

  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    const status = await pollOnce(input.platform, decrypted, initStep.externalJobId, videoId);
    if (status.state !== "processing") return status;
    await sleep(pollIntervalMs);
  }
  return { state: "processing", platformPostId: null, errorMessage: `Did not reach a terminal state within ${maxPollAttempts} poll attempts` };
}

async function pollOnce(platform: "tiktok" | "instagram" | "youtube", credentials: DecryptedCredentialPayload, externalJobId: string, videoId: string | null): Promise<PublishPollResult> {
  switch (platform) {
    case "tiktok": {
      const status = await publish.fetchTikTokPublishStatus({ accessToken: credentials.accessToken }, { publishId: externalJobId });
      return { state: status.state, platformPostId: status.platformPostId, errorMessage: status.errorMessage };
    }
    case "instagram": {
      if (!credentials.resourceId) throw new Error("Instagram poll needs the linked business account id");
      const status = await publish.fetchInstagramContainerStatus({ accessToken: credentials.accessToken, instagramBusinessAccountId: credentials.resourceId }, { containerId: externalJobId });
      // Instagram's container reaching FINISHED does not itself carry a post id — the separate confirm step's media_publish call produces one.
      return { state: status.state, platformPostId: null, errorMessage: status.errorMessage };
    }
    case "youtube": {
      const status = await publish.fetchYouTubeVideoStatus({ accessToken: credentials.accessToken }, videoId!);
      return { state: status.state, platformPostId: status.state === "succeeded" ? videoId : null, errorMessage: status.errorMessage };
    }
  }
}
