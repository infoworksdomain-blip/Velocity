/**
 * Token-refresh scheduling decisions (STEP 11: "token refresh daemon with
 * T-7/T-3/T-1 notifications"). Pure — takes `expiresAt`/`now` as plain
 * values, so GATE 11's "token refresh proven by fast-forwarding expiry"
 * is a real, direct test of this function (pass a `now` 7/3/1 days before
 * a fixed `expiresAt`), not something that needs to wait on real wall-clock
 * time or fake a whole daemon process.
 */

export type ExpiryNotificationLevel = "T-7" | "T-3" | "T-1" | "expired";

const DAY_MS = 86400000;

/**
 * Which notification threshold `now` currently falls into, relative to
 * `expiresAt`. Returns the LOWEST (most urgent) threshold `now` has
 * reached — e.g. 2 days before expiry is still past the T-3 threshold,
 * so it returns "T-3", not null just because it's not exactly 3 days out.
 * A caller ticking daily will see "T-7" once, then "T-3" for a few days,
 * then "T-1", then "expired" — real, if occasionally-repeated,
 * notifications rather than a fragile exact-day match.
 */
export function computeExpiryNotificationLevel(expiresAt: Date, now: Date): ExpiryNotificationLevel | null {
  const msRemaining = expiresAt.getTime() - now.getTime();
  if (msRemaining <= 0) return "expired";
  if (msRemaining <= DAY_MS) return "T-1";
  if (msRemaining <= 3 * DAY_MS) return "T-3";
  if (msRemaining <= 7 * DAY_MS) return "T-7";
  return null;
}

/** Proactive-refresh policy: attempt a refresh once the token is inside the T-7 window, well before it's actually needed for a call — a failed refresh attempt here (revoked token) is discovered on the daemon's own schedule, not at the moment a real publish needs the token. */
export function shouldAttemptRefresh(expiresAt: Date, now: Date): boolean {
  return computeExpiryNotificationLevel(expiresAt, now) !== null;
}
