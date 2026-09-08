/**
 * Real exponential backoff with a cap, and a max-attempts cutoff after
 * which a delivery is marked exhausted rather than retried forever
 * (build script: "exponential-backoff retries, delivery log, replay
 * endpoint" — "replay" exists precisely because exhausted deliveries are
 * a real terminal state a human can still act on, not silently dropped).
 */

export const MAX_DELIVERY_ATTEMPTS = 6;
const BASE_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 3600;

/** attempt is 1-indexed (the attempt number that just failed) — returns the delay before the NEXT attempt. */
export function computeNextRetryDelaySeconds(attempt: number): number {
  const delay = BASE_DELAY_SECONDS * 2 ** (attempt - 1);
  return Math.min(delay, MAX_DELAY_SECONDS);
}

export function isExhausted(attempt: number): boolean {
  return attempt >= MAX_DELIVERY_ATTEMPTS;
}
