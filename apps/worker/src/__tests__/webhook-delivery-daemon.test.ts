import { randomUUID } from "node:crypto";
import { webhooks } from "@velocity/core";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWebhookDeliveryTick } from "../jobs/webhook-delivery-daemon.js";

const { emitWebhookEvent } = webhooks;

/**
 * The webhook-delivery daemon (STEP 16), proven against a real embedded
 * Postgres (PGlite) — mirrors STEP 11/13's daemon test shape exactly.
 */
describe("runWebhookDeliveryTick — against a real embedded Postgres (PGlite)", () => {
  let testDb: PgliteTestDb;
  let workspaceId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "WS", workspaceType: "business" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  it("delivers a due, never-attempted delivery for real, against a local mock server", async () => {
    const endpointId = randomUUID();
    await testDb.admin.insert(schema.webhooks).values({ id: endpointId, workspaceId, url: "https://example.com/hook", secret: "s", events: ["render.completed"], isActive: true });
    await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "render.completed", payload: { renderId: "r1" } });

    const okFetch: typeof fetch = async () => new Response("ok", { status: 200 });
    const result = await runWebhookDeliveryTick({ db: testDb.admin, fetchImpl: okFetch });

    expect(result.delivered).toHaveLength(1);
    expect(result.retried).toHaveLength(0);
  });

  it("retries a failing delivery on the next tick only once its nextRetryAt has passed, not before", async () => {
    const endpointId = randomUUID();
    await testDb.admin.insert(schema.webhooks).values({ id: endpointId, workspaceId, url: "https://example.com/failing", secret: "s", events: ["quota.threshold"], isActive: true });
    await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "quota.threshold", payload: {} });

    const failingFetch: typeof fetch = async () => new Response("error", { status: 500 });
    const t0 = new Date("2026-06-01T00:00:00Z");
    const firstTick = await runWebhookDeliveryTick({ db: testDb.admin, fetchImpl: failingFetch, now: t0 });
    expect(firstTick.retried).toHaveLength(1);

    // Immediately after — the delivery's nextRetryAt is in the future, so a same-instant tick must not re-attempt it.
    const immediateTick = await runWebhookDeliveryTick({ db: testDb.admin, fetchImpl: failingFetch, now: t0 });
    expect(immediateTick.retried).toHaveLength(0);
    expect(immediateTick.delivered).toHaveLength(0);

    // Fast-forward past the scheduled retry time — the same instant this codebase already uses to prove daemon behaviour without waiting on real wall-clock time (STEP 11's token-refresh-daemon test).
    const farFuture = new Date(t0.getTime() + 24 * 60 * 60 * 1000);
    const laterTick = await runWebhookDeliveryTick({ db: testDb.admin, fetchImpl: failingFetch, now: farFuture });
    expect(laterTick.retried).toHaveLength(1);
  });

  it("never re-selects an exhausted delivery for another attempt", async () => {
    const endpointId = randomUUID();
    await testDb.admin.insert(schema.webhooks).values({ id: endpointId, workspaceId, url: "https://example.com/always-fails", secret: "s", events: ["credits.low"], isActive: true });
    const { deliveryIds } = await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "credits.low", payload: {} });

    const failingFetch: typeof fetch = async () => new Response("error", { status: 500 });
    let now = new Date("2026-07-01T00:00:00Z");
    for (let i = 0; i < webhooks.MAX_DELIVERY_ATTEMPTS; i++) {
      await runWebhookDeliveryTick({ db: testDb.admin, fetchImpl: failingFetch, now });
      now = new Date(now.getTime() + 24 * 60 * 60 * 1000); // always past whatever backoff was scheduled
    }

    const deliveryRows = await testDb.admin.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, deliveryIds[0]!));
    expect(deliveryRows[0]!.attemptCount).toBe(webhooks.MAX_DELIVERY_ATTEMPTS);

    // One more tick, far in the future — the exhausted delivery must not be picked up again.
    const oneMoreTick = await runWebhookDeliveryTick({ db: testDb.admin, fetchImpl: failingFetch, now: new Date(now.getTime() + 999999999) });
    expect(oneMoreTick.retried).toHaveLength(0);
    expect(oneMoreTick.exhausted).toHaveLength(0);

    const finalRows = await testDb.admin.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, deliveryIds[0]!));
    expect(finalRows[0]!.attemptCount).toBe(webhooks.MAX_DELIVERY_ATTEMPTS); // unchanged — proves it was never re-attempted
  });

  it("leaves an already-delivered delivery alone on a later tick", async () => {
    const endpointId = randomUUID();
    await testDb.admin.insert(schema.webhooks).values({ id: endpointId, workspaceId, url: "https://example.com/hook-2", secret: "s", events: ["account.token_expiring"], isActive: true });
    const { deliveryIds } = await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "account.token_expiring", payload: {} });

    const okFetch: typeof fetch = async () => new Response("ok", { status: 200 });
    await runWebhookDeliveryTick({ db: testDb.admin, fetchImpl: okFetch });

    const secondTick = await runWebhookDeliveryTick({ db: testDb.admin, fetchImpl: okFetch });
    expect(secondTick.delivered).not.toContain(deliveryIds[0]!);
  });
});
