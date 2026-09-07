import { randomUUID } from "node:crypto";
import { notifications } from "@velocity/core";
import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import { runInWorkspaceTx } from "./context.js";

export interface PublishReadyInput {
  workspaceId: string;
  renderId: string;
  contentItemId: string;
  outputStorageKey: string;
  contentType: string;
  sizeBytes: number | null;
  widthPx: number;
  heightPx: number;
  durationMs: number;
  requestedByUserId: string;
}

export async function publishReady(input: PublishReadyInput): Promise<{ mediaAssetId: string }> {
  const mediaAssetId = randomUUID();

  await runInWorkspaceTx(input.workspaceId, async (db) => {
    await db.insert(schema.mediaAssets).values({
      id: mediaAssetId,
      workspaceId: input.workspaceId,
      storageKey: input.outputStorageKey,
      contentType: input.contentType,
      sourceKind: "render_output",
      sizeBytes: input.sizeBytes,
      renderId: input.renderId,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      durationMs: input.durationMs,
    });

    await db.update(schema.contentItems).set({ status: "ready" }).where(eq(schema.contentItems.id, input.contentItemId));
    await db.update(schema.renders).set({ status: "succeeded", outputStorageKey: input.outputStorageKey }).where(eq(schema.renders.id, input.renderId));
  });

  notifications.publish({
    type: "render_complete",
    workspaceId: input.workspaceId,
    userId: input.requestedByUserId,
    title: "Your video is ready",
    body: "A render finished successfully and is ready to review.",
    data: { renderId: input.renderId, mediaAssetId },
  });

  return { mediaAssetId };
}
