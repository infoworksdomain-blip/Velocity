import { randomUUID } from "node:crypto";
import { notifications } from "@velocity/core";
import type { PublishFailureKind, PublishResult } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import { runInWorkspaceTx } from "../context.js";
import { runIdempotentStep } from "./publish-step-ledger.js";

export interface RecordActivityInput {
  workspaceId: string;
  publicationId: string;
  contentItemId: string;
  renderId: string;
  platform: "tiktok" | "instagram" | "youtube";
  requestedByUserId: string;
  status: "published" | "failed";
  platformPostId: string | null;
  failureKind: PublishFailureKind | null;
  errorMessage: string | null;
}

function attemptOutcome(status: "published" | "failed", failureKind: PublishFailureKind | null): string {
  if (status === "published") return "succeeded";
  if (failureKind === "quota") return "quota_deferred";
  if (failureKind === "transient") return "transient_failure";
  return "terminal_failure";
}

/**
 * The final step: writes `publications`' current state, appends a
 * `publication_attempts` row (the append-only log `publications` itself
 * doesn't keep), and sets the AI-generated label flag (C2) per platform.
 * TikTok has no public API field for this (see adapters/tiktok-publish.ts
 * and docs/steps/STEP-12.md's scope note) — its real mechanism is
 * automatic detection of embedded C2PA Content Credentials, so
 * `aiLabelSet` for TikTok reflects `renders.c2pa_signed`, which STEP 8
 * already documented as unset in this sandbox (no production signing
 * cert) — an honest `false`, not a fabricated success. Instagram/YouTube
 * both have real, documented API parameters (`is_ai_generated`,
 * `containsSyntheticMedia`) sent unconditionally at platformInit time, so
 * `aiLabelSet` for them reflects whether the render itself is AI-generated.
 */
export async function record(input: RecordActivityInput): Promise<PublishResult> {
  return runIdempotentStep({ runInWorkspaceTx: (fn) => runInWorkspaceTx(input.workspaceId, fn), workspaceId: input.workspaceId, publicationId: input.publicationId, stepKind: "record" }, async (db) => {
    const [renderRow] = await db.select().from(schema.renders).where(eq(schema.renders.id, input.renderId)).limit(1);

    const aiLabelSet = input.status === "published" && Boolean(input.platform === "tiktok" ? renderRow?.c2paSigned : renderRow?.aiGenerated);

    await db.update(schema.publications).set({ status: input.status, platformPostId: input.platformPostId, aiLabelSet }).where(eq(schema.publications.id, input.publicationId));

    const priorAttempts = await db.select().from(schema.publicationAttempts).where(eq(schema.publicationAttempts.publicationId, input.publicationId));
    await db.insert(schema.publicationAttempts).values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      publicationId: input.publicationId,
      attemptNumber: priorAttempts.length + 1,
      outcome: attemptOutcome(input.status, input.failureKind),
      errorMessage: input.errorMessage,
    });

    if (input.status === "published") {
      await db.update(schema.contentItems).set({ status: "published" }).where(eq(schema.contentItems.id, input.contentItemId));
    }

    const result: PublishResult = { publicationId: input.publicationId, status: input.status, platformPostId: input.platformPostId, aiLabelSet, failureKind: input.failureKind, errorMessage: input.errorMessage };

    notifications.publish({
      type: input.status === "published" ? "publish_succeeded" : "publish_failed",
      workspaceId: input.workspaceId,
      userId: input.requestedByUserId,
      title: input.status === "published" ? `Published to ${input.platform}` : `Publishing to ${input.platform} failed`,
      body: input.status === "published" ? "Your content is now live." : (input.errorMessage ?? "See publication attempts for details."),
      data: { publicationId: input.publicationId, platform: input.platform, platformPostId: input.platformPostId },
    });

    return result;
  });
}
