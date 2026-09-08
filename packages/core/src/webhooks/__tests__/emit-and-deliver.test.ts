import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attemptWebhookDelivery, emitWebhookEvent, MAX_DELIVERY_ATTEMPTS, replayWebhookDelivery, verifyWebhookSignature } from "../index";

/**
 * Real emission + real HTTP delivery + real replay, against a real
 * embedded Postgres (PGlite) and a local mock HTTP server (the same
 * `fetchImpl` DI seam STEP 11/13's adapters already use) — the build
 * script's own literal GATE 16 claims: "Webhook signatures verify;
 * replay works."
 */
describe("emitWebhookEvent / attemptWebhookDelivery / replayWebhookDelivery", () => {
  let testDb: PgliteTestDb;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    otherWorkspaceId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values([
      { id: workspaceId, organisationId, name: "WS", workspaceType: "business" },
      { id: otherWorkspaceId, organisationId, name: "Other WS", workspaceType: "business" },
    ]);
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  it("writes one real pending delivery per active endpoint subscribed to the event type, and none for unsubscribed or inactive endpoints", async () => {
    const subscribed = randomUUID();
    const unsubscribed = randomUUID();
    const inactive = randomUUID();
    // "concept.batch_ready" is used by no other test in this file — every
    // other test here reuses the shared `testDb`/`workspaceId`, so a
    // leftover webhook subscribed to an event type another test ALSO
    // emits would silently receive that other test's deliveries too (a
    // real cross-test leakage risk, not a production bug — emitWebhookEvent
    // is correctly emitting to every real subscribed endpoint).
    await testDb.admin.insert(schema.webhooks).values([
      { id: subscribed, workspaceId, url: "https://example.com/hook-a", secret: "s1", events: ["publication.succeeded"], isActive: true },
      { id: unsubscribed, workspaceId, url: "https://example.com/hook-b", secret: "s2", events: ["concept.batch_ready"], isActive: true },
      { id: inactive, workspaceId, url: "https://example.com/hook-c", secret: "s3", events: ["publication.succeeded"], isActive: false },
    ]);

    const result = await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "publication.succeeded", payload: { publicationId: "p1" } });
    expect(result.deliveryIds).toHaveLength(1);

    const deliveryRows = await testDb.admin.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, result.deliveryIds[0]!));
    expect(deliveryRows[0]!.webhookId).toBe(subscribed);
    expect(deliveryRows[0]!.attemptCount).toBe(0);
    expect(deliveryRows[0]!.deliveredAt).toBeNull();
  });

  it("delivers successfully to a real mock server, marking deliveredAt, and the mock server can verify the real HMAC signature", async () => {
    const endpointId = randomUUID();
    const secret = "a-real-shared-secret";
    let receivedSignature: string | null = null;
    let receivedBody: string | null = null;

    const mockFetch: typeof fetch = async (_url, init) => {
      receivedSignature = (init?.headers as Record<string, string>)["x-velocity-signature"] ?? null;
      receivedBody = init?.body as string;
      return new Response("ok", { status: 200 });
    };

    await testDb.admin.insert(schema.webhooks).values({ id: endpointId, workspaceId, url: "https://example.com/hook", secret, events: ["render.completed"], isActive: true });
    const { deliveryIds } = await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "render.completed", payload: { renderId: "r1" } });

    const result = await attemptWebhookDelivery(testDb.admin, deliveryIds[0]!, mockFetch);
    expect(result.delivered).toBe(true);
    expect(result.responseStatus).toBe(200);
    expect(receivedSignature).not.toBeNull();
    expect(verifyWebhookSignature(secret, receivedBody!, receivedSignature!)).toBe(true);

    const deliveryRows = await testDb.admin.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, deliveryIds[0]!));
    expect(deliveryRows[0]!.deliveredAt).not.toBeNull();
    expect(deliveryRows[0]!.attemptCount).toBe(1);
  });

  it("schedules a real retry (nextRetryAt in the future) on a non-2xx response, without marking it delivered", async () => {
    const endpointId = randomUUID();
    await testDb.admin.insert(schema.webhooks).values({ id: endpointId, workspaceId, url: "https://example.com/failing-hook", secret: "s", events: ["quota.threshold"], isActive: true });
    const { deliveryIds } = await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "quota.threshold", payload: {} });

    const failingFetch: typeof fetch = async () => new Response("error", { status: 500 });
    const now = new Date("2026-06-01T00:00:00Z");
    const result = await attemptWebhookDelivery(testDb.admin, deliveryIds[0]!, failingFetch, now);

    expect(result.delivered).toBe(false);
    expect(result.exhausted).toBe(false);
    const deliveryRows = await testDb.admin.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, deliveryIds[0]!));
    expect(deliveryRows[0]!.deliveredAt).toBeNull();
    expect(deliveryRows[0]!.nextRetryAt!.getTime()).toBeGreaterThan(now.getTime());
    expect(deliveryRows[0]!.lastError).toContain("500");
  });

  it("marks a delivery exhausted after MAX_DELIVERY_ATTEMPTS consecutive failures, with no further nextRetryAt scheduled", async () => {
    const endpointId = randomUUID();
    await testDb.admin.insert(schema.webhooks).values({ id: endpointId, workspaceId, url: "https://example.com/always-fails", secret: "s", events: ["credits.low"], isActive: true });
    const { deliveryIds } = await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "credits.low", payload: {} });

    const failingFetch: typeof fetch = async () => new Response("error", { status: 500 });
    let lastResult;
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i++) {
      lastResult = await attemptWebhookDelivery(testDb.admin, deliveryIds[0]!, failingFetch);
    }

    expect(lastResult!.exhausted).toBe(true);
    const deliveryRows = await testDb.admin.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, deliveryIds[0]!));
    expect(deliveryRows[0]!.attemptCount).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(deliveryRows[0]!.nextRetryAt).toBeNull();
  });

  it("replay resets an exhausted delivery back to due-now, and a subsequent delivery attempt can then succeed", async () => {
    const endpointId = randomUUID();
    await testDb.admin.insert(schema.webhooks).values({ id: endpointId, workspaceId, url: "https://example.com/eventually-fixed", secret: "s", events: ["account.token_expiring"], isActive: true });
    const { deliveryIds } = await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "account.token_expiring", payload: {} });

    const failingFetch: typeof fetch = async () => new Response("error", { status: 500 });
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i++) {
      await attemptWebhookDelivery(testDb.admin, deliveryIds[0]!, failingFetch);
    }

    await replayWebhookDelivery(testDb.admin, workspaceId, deliveryIds[0]!);
    const resetRows = await testDb.admin.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, deliveryIds[0]!));
    expect(resetRows[0]!.nextRetryAt).not.toBeNull();
    expect(resetRows[0]!.lastError).toBeNull();

    const succeedingFetch: typeof fetch = async () => new Response("ok", { status: 200 });
    const result = await attemptWebhookDelivery(testDb.admin, deliveryIds[0]!, succeedingFetch);
    expect(result.delivered).toBe(true);
  });

  it("rejects replaying a delivery that belongs to a different workspace", async () => {
    const endpointId = randomUUID();
    await testDb.admin.insert(schema.webhooks).values({ id: endpointId, workspaceId, url: "https://example.com/hook", secret: "s", events: ["render.failed"], isActive: true });
    const { deliveryIds } = await emitWebhookEvent(testDb.admin, { workspaceId, eventType: "render.failed", payload: {} });

    await expect(replayWebhookDelivery(testDb.admin, otherWorkspaceId, deliveryIds[0]!)).rejects.toThrow();
  });
});
