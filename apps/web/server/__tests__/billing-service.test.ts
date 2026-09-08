// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createSubscriptionCheckoutSession,
  createTopUpCheckoutSession,
  getWorkspaceSubscription,
  handleStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "../billing-service";

/**
 * A real HTTP server mimicking Stripe's own API response shapes,
 * exercised via the real `stripe` SDK with `host`/`port`/`protocol`
 * pointed at it (Stripe's own documented override mechanism) — the same
 * "real SDK against a local server, not a mocked module" discipline
 * packages/text-engine's Anthropic/OpenAI adapter tests already
 * established for this build. Proves the REAL request Stripe's SDK sends
 * (mode, line_items, metadata) and that this service correctly parses a
 * realistic Stripe response, not just that hand-written code compiles.
 */
describe("billing-service — Stripe checkout (real SDK against a local mock Stripe-shaped server)", () => {
  let server: http.Server;
  let stripe: Stripe;
  let lastRequestPath: string;
  let lastRequestBody: URLSearchParams;
  let testDb: PgliteTestDb;
  let workspaceId: string;
  let organisationId: string;

  beforeAll(async () => {
    process.env.STRIPE_PRICE_STARTER = "price_starter_test";

    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        lastRequestPath = req.url ?? "";
        lastRequestBody = new URLSearchParams(raw);
        res.writeHead(200, { "content-type": "application/json" });
        if (req.url?.startsWith("/v1/customers")) {
          res.end(JSON.stringify({ id: "cus_test123", object: "customer" }));
        } else if (req.url?.startsWith("/v1/checkout/sessions")) {
          res.end(JSON.stringify({ id: "cs_test_abc123", object: "checkout.session", url: "https://checkout.stripe.com/pay/cs_test_abc123", mode: lastRequestBody.get("mode") }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: { message: "not found in mock" } }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    stripe = new Stripe("sk_test_fake_key_for_local_mock", { host: "127.0.0.1", port, protocol: "http" });

    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();
  }, 60000);

  beforeEach(async () => {
    organisationId = randomUUID();
    workspaceId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Demo Workspace", workspaceType: "business" });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await testDb.close();
  });

  it("creates a real Stripe customer and a subscription-mode checkout session with the resolved price id and workspace metadata", async () => {
    const result = await createSubscriptionCheckoutSession(
      { workspaceId, workspaceName: "Demo Workspace", planKey: "starter", successUrl: "https://app.test/success", cancelUrl: "https://app.test/cancel" },
      testDb.admin,
      stripe,
    );

    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_test_abc123");
    expect(lastRequestPath).toBe("/v1/checkout/sessions");
    expect(lastRequestBody.get("mode")).toBe("subscription");
    expect(lastRequestBody.get("customer")).toBe("cus_test123");
    expect(lastRequestBody.get("line_items[0][price]")).toBe("price_starter_test");
    expect(lastRequestBody.get("metadata[workspaceId]")).toBe(workspaceId);
  });

  it("creates a payment-mode checkout session for a top-up pack and records a real pending top_up_purchases row", async () => {
    const result = await createTopUpCheckoutSession(
      { workspaceId, workspaceName: "Demo Workspace", packKey: "small", successUrl: "https://app.test/success", cancelUrl: "https://app.test/cancel" },
      testDb.admin,
      stripe,
    );

    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_test_abc123");
    expect(lastRequestBody.get("mode")).toBe("payment");

    const [purchase] = await testDb.admin.select().from(schema.topUpPurchases).where(eq(schema.topUpPurchases.stripeCheckoutSessionId, "cs_test_abc123"));
    expect(purchase).toBeDefined();
    expect(purchase?.workspaceId).toBe(workspaceId);
    expect(purchase?.creditsGranted).toBe(500);
    expect(purchase?.status).toBe("pending");
  });

  it("reuses the same Stripe customer for a second checkout once a subscriptions row exists", async () => {
    await testDb.admin.insert(schema.subscriptions).values({ id: randomUUID(), workspaceId, stripeCustomerId: "cus_existing", stripeSubscriptionId: "sub_existing", planKey: "starter", status: "active" });

    await createSubscriptionCheckoutSession({ workspaceId, workspaceName: "Demo Workspace", planKey: "starter", successUrl: "https://app.test/success", cancelUrl: "https://app.test/cancel" }, testDb.admin, stripe);

    // No POST to /v1/customers this time — lastRequestPath should be the checkout session call, reusing cus_existing.
    expect(lastRequestPath).toBe("/v1/checkout/sessions");
    expect(lastRequestBody.get("customer")).toBe("cus_existing");
  });
});

describe("verifyStripeWebhookSignature — real HMAC verification, no network call", () => {
  const stripe = new Stripe("sk_test_fake_key_never_used_for_a_real_call");

  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  });

  it("accepts a genuinely, correctly signed payload", () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
    const event = verifyStripeWebhookSignature(payload, header, stripe);
    expect(event.id).toBe("evt_1");
    expect(event.type).toBe("checkout.session.completed");
  });

  it("rejects a payload signed with the WRONG secret (a forged/tampered webhook)", () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_a_completely_different_secret" });
    expect(() => verifyStripeWebhookSignature(payload, header, stripe)).toThrow();
  });

  it("rejects a payload whose body was tampered with after signing", () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
    const tamperedPayload = JSON.stringify({ id: "evt_1_TAMPERED", object: "event", type: "checkout.session.completed" });
    expect(() => verifyStripeWebhookSignature(tamperedPayload, header, stripe)).toThrow();
  });
});

describe("handleStripeWebhookEvent — real PGlite, no network needed (events are already-verified objects)", () => {
  let testDb: PgliteTestDb;
  let workspaceId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();
  }, 60000);

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    const organisationId = randomUUID();
    workspaceId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Demo Workspace", workspaceType: "business" });
  });

  function makeEvent<T>(type: string, object: T): Stripe.Event {
    return { id: `evt_${randomUUID()}`, object: "event", type, data: { object } } as unknown as Stripe.Event;
  }

  it("checkout.session.completed (mode=payment) credits the ledger exactly once and marks the top-up completed", async () => {
    const purchaseId = randomUUID();
    await testDb.admin.insert(schema.topUpPurchases).values({ id: purchaseId, workspaceId, stripeCheckoutSessionId: "cs_realistic_1", creditsGranted: 500, amountUsd: "10.00", status: "pending" });

    const event = makeEvent("checkout.session.completed", { id: "cs_realistic_1", mode: "payment" });
    await handleStripeWebhookEvent(event, testDb.admin);

    const [purchase] = await testDb.admin.select().from(schema.topUpPurchases).where(eq(schema.topUpPurchases.id, purchaseId));
    expect(purchase?.status).toBe("completed");

    const ledgerRows = await testDb.admin.select().from(schema.creditLedger).where(eq(schema.creditLedger.referenceId, purchaseId));
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]?.credit).toBe(500);

    // A duplicate delivery of the SAME event (Stripe's own documented at-least-once guarantee) must not double-credit.
    await handleStripeWebhookEvent(event, testDb.admin);
    const ledgerRowsAfterRetry = await testDb.admin.select().from(schema.creditLedger).where(eq(schema.creditLedger.referenceId, purchaseId));
    expect(ledgerRowsAfterRetry).toHaveLength(1);
  });

  it("customer.subscription.updated creates a real subscriptions row from Stripe's own subscription shape", async () => {
    process.env.STRIPE_PRICE_GROWTH = "price_growth_realistic";
    const event = makeEvent("customer.subscription.updated", {
      id: "sub_realistic_1",
      customer: "cus_realistic_1",
      status: "active",
      metadata: { workspaceId },
      items: { data: [{ price: { id: "price_growth_realistic" }, current_period_end: 1780000000 }] },
    });
    await handleStripeWebhookEvent(event, testDb.admin);

    const subscription = await getWorkspaceSubscription(workspaceId, testDb.admin);
    expect(subscription?.stripeSubscriptionId).toBe("sub_realistic_1");
    expect(subscription?.stripeCustomerId).toBe("cus_realistic_1");
    expect(subscription?.planKey).toBe("growth");
    expect(subscription?.status).toBe("active");
  });

  it("customer.subscription.deleted marks the local row canceled", async () => {
    await testDb.admin.insert(schema.subscriptions).values({ id: randomUUID(), workspaceId, stripeCustomerId: "cus_x", stripeSubscriptionId: "sub_x", planKey: "starter", status: "active" });

    const event = makeEvent("customer.subscription.deleted", { id: "sub_x", customer: "cus_x", metadata: { workspaceId } });
    await handleStripeWebhookEvent(event, testDb.admin);

    const subscription = await getWorkspaceSubscription(workspaceId, testDb.admin);
    expect(subscription?.status).toBe("canceled");
  });

  it("invoice.paid syncs a real invoices row against the workspace resolved via the customer's subscription", async () => {
    await testDb.admin.insert(schema.subscriptions).values({ id: randomUUID(), workspaceId, stripeCustomerId: "cus_inv_1", stripeSubscriptionId: "sub_inv_1", planKey: "starter", status: "active" });

    const event = makeEvent("invoice.paid", { id: "in_realistic_1", customer: "cus_inv_1", amount_paid: 2900, amount_due: 2900, status: "paid", status_transitions: { finalized_at: 1780000000 } });
    await handleStripeWebhookEvent(event, testDb.admin);

    const invoiceRows = await testDb.admin.select().from(schema.invoices).where(and(eq(schema.invoices.workspaceId, workspaceId), eq(schema.invoices.stripeInvoiceId, "in_realistic_1")));
    expect(invoiceRows).toHaveLength(1);
    expect(invoiceRows[0]?.amountUsd).toBe("29.00");
    expect(invoiceRows[0]?.status).toBe("paid");
  });

  it("invoice.payment_failed syncs the failed status — the real dunning trigger signal", async () => {
    await testDb.admin.insert(schema.subscriptions).values({ id: randomUUID(), workspaceId, stripeCustomerId: "cus_fail_1", stripeSubscriptionId: "sub_fail_1", planKey: "starter", status: "past_due" });

    const event = makeEvent("invoice.payment_failed", { id: "in_failed_1", customer: "cus_fail_1", amount_paid: 0, amount_due: 2900, status: "open", status_transitions: { finalized_at: 1780000000 } });
    await handleStripeWebhookEvent(event, testDb.admin);

    const invoiceRows = await testDb.admin.select().from(schema.invoices).where(eq(schema.invoices.stripeInvoiceId, "in_failed_1"));
    expect(invoiceRows[0]?.status).toBe("open");
  });

  it("an unrecognised event type is a deliberate no-op, not an error", async () => {
    const event = makeEvent("payment_intent.created", { id: "pi_1" });
    await expect(handleStripeWebhookEvent(event, testDb.admin)).resolves.toBeUndefined();
  });
});
