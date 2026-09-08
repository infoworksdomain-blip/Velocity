import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * The same generic `PgDatabase<any, typeof schema>` base used throughout
 * this codebase (apps/worker's `WorkspaceDb`, apps/web's `AnalyticsDb`/
 * `AssistantDb`/etc.) — deliberately placed in packages/core (not
 * apps/web) so BOTH apps/web (a webhook CRUD router) and apps/worker (the
 * publish/render pipelines that actually FIRE events) can call
 * `emitWebhookEvent` without a cross-app import, the same reason
 * `recordUsage` (packages/core/src/metering) lives here rather than in
 * either app.
 */
export type WebhookDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const WEBHOOK_EVENT_TYPES = [
  "render.completed",
  "render.failed",
  "text.generated",
  "publication.succeeded",
  "publication.failed",
  "concept.batch_ready",
  "quota.threshold",
  "credits.low",
  "account.token_expiring",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface EmitWebhookEventInput {
  workspaceId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
}

export interface EmitWebhookEventResult {
  deliveryIds: string[];
}

/**
 * Writes one real, pending `webhook_deliveries` row per active endpoint
 * subscribed to this event type. Does NOT attempt delivery itself — that's
 * `apps/worker/src/jobs/webhook-delivery-daemon.ts`'s job, the same
 * "write the durable intent here, a separate tick delivers it" split
 * STEP 11/13's daemons already use for token refresh / metrics ingestion.
 * A workspace with no webhook endpoints subscribed to this event writes
 * nothing — this is the expected, common case, not an error.
 */
export async function emitWebhookEvent(db: WebhookDb, input: EmitWebhookEventInput): Promise<EmitWebhookEventResult> {
  const endpoints = await db.select().from(schema.webhooks).where(and(eq(schema.webhooks.workspaceId, input.workspaceId), eq(schema.webhooks.isActive, true)));
  const subscribed = endpoints.filter((e) => (e.events as string[]).includes(input.eventType));

  const deliveryIds: string[] = [];
  for (const endpoint of subscribed) {
    const id = randomUUID();
    await db.insert(schema.webhookDeliveries).values({ id, workspaceId: input.workspaceId, webhookId: endpoint.id, event: input.eventType, payload: input.payload, attemptCount: 0 });
    deliveryIds.push(id);
  }
  return { deliveryIds };
}
