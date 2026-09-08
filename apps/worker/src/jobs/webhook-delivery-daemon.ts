import { webhooks } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, isNull, lt, lte, or } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

const { attemptWebhookDelivery, MAX_DELIVERY_ATTEMPTS } = webhooks;

/**
 * The webhook-delivery daemon (STEP 16, build script module 24). Same
 * dependency-injected tick shape as STEP 11/13's daemons (`db`/`fetchImpl`/
 * `now` all injectable) — real HTTP delivery attempts against every
 * `webhook_deliveries` row that is due (never attempted, or past its
 * `nextRetryAt`), using `packages/core`'s real signing/retry/deliver
 * logic. No cron trigger calls this yet — the same "no scheduler wired
 * up" follow-up STEP 11/12/13 already flagged, now true for webhooks too.
 */
export type WebhookDeliveryDaemonDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface WebhookDeliveryDaemonDeps {
  db: WebhookDeliveryDaemonDb;
  fetchImpl?: typeof fetch;
  now?: Date;
  batchSize?: number;
}

export interface WebhookDeliveryTickResult {
  delivered: string[];
  retried: string[];
  exhausted: string[];
}

const DEFAULT_BATCH_SIZE = 50;

export async function runWebhookDeliveryTick(deps: WebhookDeliveryDaemonDeps): Promise<WebhookDeliveryTickResult> {
  const now = deps.now ?? new Date();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  const result: WebhookDeliveryTickResult = { delivered: [], retried: [], exhausted: [] };

  // A never-attempted delivery and an EXHAUSTED one both have a null
  // nextRetryAt (see webhookDeliveries' own doc comment) — without the
  // attemptCount bound below, an exhausted delivery would be re-selected
  // and re-attempted forever, since exhaustion never advances attemptCount
  // past the point that first set nextRetryAt to null.
  const dueRows = await deps.db
    .select({ id: schema.webhookDeliveries.id })
    .from(schema.webhookDeliveries)
    .where(
      and(
        isNull(schema.webhookDeliveries.deliveredAt),
        lt(schema.webhookDeliveries.attemptCount, MAX_DELIVERY_ATTEMPTS),
        or(isNull(schema.webhookDeliveries.nextRetryAt), lte(schema.webhookDeliveries.nextRetryAt, now)),
      ),
    )
    .limit(batchSize);

  for (const row of dueRows) {
    const attempt = await attemptWebhookDelivery(deps.db, row.id, fetchImpl, now);
    if (attempt.delivered) result.delivered.push(row.id);
    else if (attempt.exhausted) result.exhausted.push(row.id);
    else result.retried.push(row.id);
  }

  return result;
}
