import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { audit, billing } from "@velocity/core";
import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";

/**
 * STEP 19's Billing I/O layer. Same generic-`db`-parameter pattern as
 * every other *-service.ts in this app. Real Stripe SDK usage throughout
 * (checkout sessions, the real Billing Portal for upgrade/downgrade/
 * cancel rather than hand-building that UI -- Stripe's own portal
 * natively handles proration, which is why this step doesn't reimplement
 * proration math anywhere), gated the same way every other funded-
 * credential integration in this build is: real request/response
 * handling, no live network call possible without a real STRIPE_SECRET_KEY
 * this sandbox doesn't have. `stripe` is always the last, optional,
 * default-constructed parameter (mirroring `db`), so tests inject a
 * client built with a custom httpClient against a local mock server --
 * the exact request/response shape the real SDK builds, with no live
 * network call, the same discipline STEP 8B/11's provider adapters use.
 */
export type BillingDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let cachedStripeClient: Stripe | undefined;
function defaultStripeClient(): Stripe {
  cachedStripeClient ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return cachedStripeClient;
}

export function resetStripeClientForTests(): void {
  cachedStripeClient = undefined;
}

// ---------------------------------------------------------------------------
// Customer + subscription lookup
// ---------------------------------------------------------------------------

export interface WorkspaceSubscriptionRow {
  id: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planKey: string;
  status: string;
  currentPeriodEnd: Date | null;
  updatedAt: Date;
}

export async function getWorkspaceSubscription(workspaceId: string, db: BillingDb = getAdminDb()): Promise<WorkspaceSubscriptionRow | null> {
  const rows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.workspaceId, workspaceId)).limit(1);
  return rows[0] ?? null;
}

/** Ensures a real Stripe Customer exists for this workspace, creating one on first use. Idempotent: a workspace with an existing subscriptions row reuses its stripeCustomerId rather than creating a duplicate customer. */
export async function ensureStripeCustomer(workspaceId: string, workspaceName: string, db: BillingDb = getAdminDb(), stripe: Stripe = defaultStripeClient()): Promise<string> {
  const existing = await getWorkspaceSubscription(workspaceId, db);
  if (existing) return existing.stripeCustomerId;

  const customer = await stripe.customers.create({ name: workspaceName, metadata: { workspaceId } });
  return customer.id;
}

// ---------------------------------------------------------------------------
// Checkout — new subscriptions and one-time credit top-ups both go
// through Stripe Checkout (the real, hosted, PCI-scope-free flow every
// production Stripe integration uses rather than collecting card details
// directly).
// ---------------------------------------------------------------------------

export interface CreateSubscriptionCheckoutInput {
  workspaceId: string;
  workspaceName: string;
  planKey: Exclude<billing.PlanKey, "free">;
  successUrl: string;
  cancelUrl: string;
}

export async function createSubscriptionCheckoutSession(input: CreateSubscriptionCheckoutInput, db: BillingDb = getAdminDb(), stripe: Stripe = defaultStripeClient()): Promise<{ checkoutUrl: string }> {
  const customerId = await ensureStripeCustomer(input.workspaceId, input.workspaceName, db, stripe);
  const priceId = billing.resolveStripePriceId(input.planKey);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { workspaceId: input.workspaceId, planKey: input.planKey },
    subscription_data: { metadata: { workspaceId: input.workspaceId } },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { checkoutUrl: session.url };
}

const TOP_UP_PACKS = {
  small: { credits: 500, amountUsd: 10 },
  medium: { credits: 2500, amountUsd: 40 },
  large: { credits: 6000, amountUsd: 80 },
} as const;
export type TopUpPackKey = keyof typeof TOP_UP_PACKS;

export interface CreateTopUpCheckoutInput {
  workspaceId: string;
  workspaceName: string;
  packKey: TopUpPackKey;
  successUrl: string;
  cancelUrl: string;
}

export async function createTopUpCheckoutSession(input: CreateTopUpCheckoutInput, db: BillingDb = getAdminDb(), stripe: Stripe = defaultStripeClient()): Promise<{ checkoutUrl: string }> {
  const pack = TOP_UP_PACKS[input.packKey];
  const customerId = await ensureStripeCustomer(input.workspaceId, input.workspaceName, db, stripe);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price_data: { currency: "usd", product_data: { name: `${pack.credits} credit top-up` }, unit_amount: Math.round(pack.amountUsd * 100) }, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { workspaceId: input.workspaceId, topUpPackKey: input.packKey, creditsGranted: String(pack.credits) },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  // Recorded as `pending` here (before the customer has actually paid) so
  // the webhook handler below only ever needs to UPDATE a known row by
  // its unique stripe_checkout_session_id -- never a first-write race
  // against a webhook that could in principle arrive before this
  // function returns.
  await db.insert(schema.topUpPurchases).values({ id: randomUUID(), workspaceId: input.workspaceId, stripeCheckoutSessionId: session.id, creditsGranted: pack.credits, amountUsd: pack.amountUsd.toFixed(2), status: "pending" });

  return { checkoutUrl: session.url };
}

/** The real Stripe Billing Portal -- upgrade/downgrade (with Stripe's own native proration), payment-method update, and cancellation all happen inside Stripe's hosted UI, not a hand-built page here. */
export async function createBillingPortalSession(workspaceId: string, returnUrl: string, db: BillingDb = getAdminDb(), stripe: Stripe = defaultStripeClient()): Promise<{ portalUrl: string }> {
  const subscription = await getWorkspaceSubscription(workspaceId, db);
  if (!subscription) throw new Error(`Workspace ${workspaceId} has no billing customer yet -- subscribe to a paid plan first`);
  const session = await stripe.billingPortal.sessions.create({ customer: subscription.stripeCustomerId, return_url: returnUrl });
  return { portalUrl: session.url };
}

// ---------------------------------------------------------------------------
// Webhooks -- the real source of truth for subscription/invoice/top-up
// state. Nothing above this line writes `subscriptions`/`invoices`
// status directly; only Stripe's own signed events do, so local state
// can never drift ahead of what Stripe actually confirmed happened.
// ---------------------------------------------------------------------------

/** Real signature verification (Stripe.webhooks.constructEvent) -- pure crypto, no network call, so this is testable end to end with a real signed test payload (stripe.webhooks.generateTestHeaderString) and no live Stripe connection. Throws on an invalid/forged signature, exactly the security boundary a public webhook endpoint needs. */
export function verifyStripeWebhookSignature(rawBody: string | Buffer, signatureHeader: string, stripe: Stripe = defaultStripeClient()): Stripe.Event {
  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session, db: BillingDb): Promise<void> {
  if (session.mode === "payment") {
    // A top-up purchase -- credit the ledger exactly once, keyed on the
    // unique stripe_checkout_session_id so a duplicate webhook delivery
    // (Stripe's own documented at-least-once guarantee) never double-grants.
    const [purchase] = await db.select().from(schema.topUpPurchases).where(eq(schema.topUpPurchases.stripeCheckoutSessionId, session.id)).limit(1);
    if (!purchase) return; // Not one of our tracked top-ups (or an unrelated payment-mode session) -- nothing to do.
    if (purchase.status === "completed") return; // Already processed -- idempotent no-op.

    await db.insert(schema.creditLedger).values({ id: randomUUID(), workspaceId: purchase.workspaceId, debit: 0, credit: purchase.creditsGranted, reason: "topup", referenceId: purchase.id });
    await db.update(schema.topUpPurchases).set({ status: "completed" }).where(eq(schema.topUpPurchases.id, purchase.id));
    await audit.writeAuditLog(db, { workspaceId: purchase.workspaceId, actorUserId: null, action: "billing.topup_completed", targetType: "top_up_purchase", targetId: purchase.id, before: { status: "pending" }, after: { status: "completed", creditsGranted: purchase.creditsGranted } });
    return;
  }

  // mode === "subscription": the subscription itself is created by Stripe
  // and synced via customer.subscription.created/updated below -- this
  // event alone doesn't carry final subscription status, just confirms
  // checkout succeeded.
}

async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription, db: BillingDb): Promise<void> {
  const workspaceId = subscription.metadata.workspaceId;
  if (!workspaceId) throw new Error(`Stripe subscription ${subscription.id} has no workspaceId metadata -- was it created outside createSubscriptionCheckoutSession?`);

  const priceId = subscription.items.data[0]?.price.id;
  const resolvedPlanKey = priceId ? billing.resolvePlanKeyFromStripePriceId(priceId) : null;

  const existing = await db.select({ id: schema.subscriptions.id }).from(schema.subscriptions).where(eq(schema.subscriptions.workspaceId, workspaceId)).limit(1);
  const values = {
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    planKey: resolvedPlanKey ?? "starter", // a price id with no configured plan is a real config gap, not grounds to crash the webhook -- default to the cheapest paid plan and let reconciliation surface the mismatch
    status: subscription.status,
    currentPeriodEnd: subscription.items.data[0]?.current_period_end ? new Date(subscription.items.data[0].current_period_end * 1000) : null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(schema.subscriptions).set(values).where(eq(schema.subscriptions.id, existing[0].id));
  } else {
    await db.insert(schema.subscriptions).values({ id: randomUUID(), workspaceId, ...values });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, db: BillingDb): Promise<void> {
  const workspaceId = subscription.metadata.workspaceId;
  if (!workspaceId) return;
  await db.update(schema.subscriptions).set({ status: "canceled", updatedAt: new Date() }).where(eq(schema.subscriptions.workspaceId, workspaceId));
}

async function upsertInvoiceFromStripe(invoice: Stripe.Invoice, db: BillingDb): Promise<void> {
  // Invoices don't carry workspace metadata directly -- resolve via the customer's subscription row.
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const [subscriptionRow] = await db.select({ workspaceId: schema.subscriptions.workspaceId }).from(schema.subscriptions).where(eq(schema.subscriptions.stripeCustomerId, customerId)).limit(1);
  if (!subscriptionRow) return; // An invoice for a customer we don't recognise yet -- nothing to attach it to.

  const existing = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.stripeInvoiceId, invoice.id ?? "")).limit(1);
  const values = { amountUsd: (invoice.amount_paid || invoice.amount_due) / 100, status: invoice.status ?? "draft", issuedAt: invoice.status_transitions.finalized_at ? new Date(invoice.status_transitions.finalized_at * 1000) : null, updatedAt: new Date() };

  if (existing[0]) {
    await db.update(schema.invoices).set({ ...values, amountUsd: values.amountUsd.toFixed(2) }).where(eq(schema.invoices.id, existing[0].id));
  } else {
    await db.insert(schema.invoices).values({ id: randomUUID(), workspaceId: subscriptionRow.workspaceId, stripeInvoiceId: invoice.id ?? "", amountUsd: values.amountUsd.toFixed(2), status: values.status, issuedAt: values.issuedAt });
  }
}

/**
 * The single dispatcher every real event from `verifyStripeWebhookSignature`
 * flows through -- one place that knows which event types this system
 * cares about, matching the "one real mechanism" discipline STEP 16's
 * webhook system already established. An unhandled event type is a
 * deliberate no-op, not an error: Stripe sends dozens of event types this
 * integration has no reason to react to.
 */
export async function handleStripeWebhookEvent(event: Stripe.Event, db: BillingDb = getAdminDb()): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object, db);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertSubscriptionFromStripe(event.data.object, db);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, db);
      return;
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.finalized":
      await upsertInvoiceFromStripe(event.data.object, db);
      return;
    default:
      return;
  }
}
