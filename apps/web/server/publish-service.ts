import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
// @velocity/worker has no "exports" restriction — reaches the compiled
// Temporal client directly, the same pattern render-service.ts already
// uses for startRenderWorkflow.
import { startPublishWorkflow } from "@velocity/worker/dist/temporal/client.js";
import { and, desc, eq } from "drizzle-orm";
import { getAdminDb } from "./db";

export interface TriggerPublishInput {
  workspaceId: string;
  userId: string;
  contentItemId: string;
  socialAccountId: string;
}

export interface TriggerPublishResult {
  publicationId: string;
  workflowId: string;
  alreadyExisted: boolean;
}

/**
 * The actual "trigger STEP 12's publish pipeline" mechanism. The
 * idempotency key (`contentItemId:socialAccountId`) identifies the
 * LOGICAL post — one real post per (content, account) pair — not each
 * individual trigger attempt; a second trigger for the same pair reuses
 * the existing `publications` row via `onConflictDoNothing` + reselect
 * rather than starting a second workflow, on top of (not instead of)
 * the deterministic `publish:${publicationId}` workflow id's own
 * REJECT_DUPLICATE dedupe in startPublishWorkflow.
 */
export async function triggerPublish(input: TriggerPublishInput): Promise<TriggerPublishResult> {
  const db = getAdminDb();

  const accountRows = await db.select().from(schema.socialAccounts).where(and(eq(schema.socialAccounts.id, input.socialAccountId), eq(schema.socialAccounts.workspaceId, input.workspaceId))).limit(1);
  const account = accountRows[0];
  if (!account) throw new Error(`Social account ${input.socialAccountId} not found in workspace ${input.workspaceId}`);

  const renderRows = await db
    .select()
    .from(schema.renders)
    .where(and(eq(schema.renders.contentItemId, input.contentItemId), eq(schema.renders.status, "succeeded")))
    .orderBy(desc(schema.renders.createdAt))
    .limit(1);
  const render = renderRows[0];
  if (!render) throw new Error(`Content item ${input.contentItemId} has no succeeded render to publish`);

  const idempotencyKey = `${input.contentItemId}:${input.socialAccountId}`;
  const newId = randomUUID();
  await db
    .insert(schema.publications)
    .values({ id: newId, workspaceId: input.workspaceId, contentItemId: input.contentItemId, socialAccountId: input.socialAccountId, idempotencyKey, status: "pending" })
    .onConflictDoNothing({ target: schema.publications.idempotencyKey });

  const publicationRows = await db.select().from(schema.publications).where(eq(schema.publications.idempotencyKey, idempotencyKey)).limit(1);
  const publication = publicationRows[0];
  if (!publication) throw new Error(`Publication row for idempotency key ${idempotencyKey} was not found after insert — this is a publish-service bug`);
  const alreadyExisted = publication.id !== newId;

  // A publication that already existed already has (or is getting) a real
  // workflow execution under `publish:${publication.id}` — starting a
  // second one would hit REJECT_DUPLICATE and throw; the caller should
  // poll this publication's status instead, not retrigger it.
  if (alreadyExisted) {
    return { publicationId: publication.id, workflowId: `publish:${publication.id}`, alreadyExisted: true };
  }

  const { workflowId } = await startPublishWorkflow({
    publicationId: publication.id,
    workspaceId: input.workspaceId,
    contentItemId: input.contentItemId,
    renderId: render.id,
    socialAccountId: input.socialAccountId,
    platform: account.platform,
    idempotencyKey,
    requestedByUserId: input.userId,
  });

  return { publicationId: publication.id, workflowId, alreadyExisted: false };
}
