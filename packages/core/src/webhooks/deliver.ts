import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import { signWebhookPayload } from "./signing.js";
import { computeNextRetryDelaySeconds, isExhausted } from "./retry.js";
import type { WebhookDb } from "./emit.js";

/**
 * Real HTTP delivery for one pending `webhook_deliveries` row — the same
 * `fetchImpl` dependency-injection seam used throughout this codebase
 * (STEP 11's OAuth adapters, STEP 13's metrics adapters) so this is
 * genuinely testable against a local mock HTTP server, not just asserted.
 * A 2xx response marks the delivery `deliveredAt`; anything else advances
 * `attemptCount` and schedules `nextRetryAt` via real exponential backoff,
 * or marks it exhausted once `MAX_DELIVERY_ATTEMPTS` is reached.
 */

export interface AttemptDeliveryResult {
  delivered: boolean;
  exhausted: boolean;
  responseStatus: number | null;
  error: string | null;
}

export async function attemptWebhookDelivery(db: WebhookDb, deliveryId: string, fetchImpl: typeof fetch = fetch, now: Date = new Date()): Promise<AttemptDeliveryResult> {
  const rows = await db
    .select({ delivery: schema.webhookDeliveries, endpoint: schema.webhooks })
    .from(schema.webhookDeliveries)
    .innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId))
    .where(eq(schema.webhookDeliveries.id, deliveryId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`Webhook delivery ${deliveryId} not found`);

  const rawBody = JSON.stringify({ event: row.delivery.event, data: row.delivery.payload, deliveryId: row.delivery.id });
  const signature = signWebhookPayload(row.endpoint.secret, rawBody);
  const attemptNumber = row.delivery.attemptCount + 1;

  try {
    const response = await fetchImpl(row.endpoint.url, { method: "POST", headers: { "content-type": "application/json", "x-velocity-signature": signature, "x-velocity-event": row.delivery.event }, body: rawBody });

    if (response.ok) {
      await db.update(schema.webhookDeliveries).set({ deliveredAt: now, responseStatus: response.status, attemptCount: attemptNumber, nextRetryAt: null, lastError: null, updatedAt: now }).where(eq(schema.webhookDeliveries.id, deliveryId));
      return { delivered: true, exhausted: false, responseStatus: response.status, error: null };
    }

    const error = `HTTP ${response.status}`;
    const exhausted = isExhausted(attemptNumber);
    await db
      .update(schema.webhookDeliveries)
      .set({ responseStatus: response.status, attemptCount: attemptNumber, nextRetryAt: exhausted ? null : new Date(now.getTime() + computeNextRetryDelaySeconds(attemptNumber) * 1000), lastError: error, updatedAt: now })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
    return { delivered: false, exhausted, responseStatus: response.status, error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const exhausted = isExhausted(attemptNumber);
    await db
      .update(schema.webhookDeliveries)
      .set({ attemptCount: attemptNumber, nextRetryAt: exhausted ? null : new Date(now.getTime() + computeNextRetryDelaySeconds(attemptNumber) * 1000), lastError: error, updatedAt: now })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
    return { delivered: false, exhausted, responseStatus: null, error };
  }
}

/** Replay: resets a delivery (typically exhausted, but works on any) back to "due now" — the build script's own literal "replay endpoint" requirement. */
export async function replayWebhookDelivery(db: WebhookDb, workspaceId: string, deliveryId: string): Promise<void> {
  const result = await db
    .update(schema.webhookDeliveries)
    .set({ nextRetryAt: new Date(), deliveredAt: null, lastError: null, updatedAt: new Date() })
    .where(eq(schema.webhookDeliveries.id, deliveryId))
    .returning({ id: schema.webhookDeliveries.id, workspaceId: schema.webhookDeliveries.workspaceId });
  if (result.length === 0 || result[0]!.workspaceId !== workspaceId) throw new Error(`Webhook delivery ${deliveryId} not found in workspace ${workspaceId}`);
}
