import { handleStripeWebhookEvent, verifyStripeWebhookSignature } from "@/server/billing-service";

/**
 * STEP 19's Stripe webhook endpoint — the real source of truth for
 * subscription/invoice/top-up state (see billing-service.ts's own doc
 * comment: nothing else writes that state). Reads the RAW body text, not
 * `req.json()` — Stripe's signature is computed over the exact bytes
 * sent, and re-serialising a parsed object would produce a different
 * byte sequence and fail verification even for a genuine event.
 */
export async function POST(req: Request): Promise<Response> {
  const signatureHeader = req.headers.get("stripe-signature");
  if (!signatureHeader) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event;
  try {
    event = verifyStripeWebhookSignature(rawBody, signatureHeader);
  } catch (error) {
    return Response.json({ error: `Signature verification failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 400 });
  }

  await handleStripeWebhookEvent(event);

  return Response.json({ received: true });
}
