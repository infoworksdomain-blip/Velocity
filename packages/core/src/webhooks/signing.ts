import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 webhook signing (STEP 16, build script module 24:
 * "HMAC-signed, exponential-backoff retries, delivery log, replay
 * endpoint"). The signature covers the exact raw payload bytes sent, the
 * same "sign what you send, verify what you receive" discipline as any
 * webhook provider (Stripe's own signing scheme is the closest real-world
 * analogue this build already references elsewhere, e.g. the `vclid`
 * attribution pattern in STEP 13).
 */

export function signWebhookPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** Constant-time comparison — a naive `===` on signatures is a real timing side-channel, the same class of mistake STEP 3's password/token handling already avoids. */
export function verifyWebhookSignature(secret: string, rawBody: string, providedSignature: string): boolean {
  const expected = signWebhookPayload(secret, rawBody);
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(providedSignature, "hex");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
