import type { PublishFailureKind } from "@velocity/contracts";

/**
 * The build script's failure taxonomy: "transient (retry with backoff) ·
 * terminal (surface with a specific remedy) · quota (auto-reschedule to
 * the next free slot)." Classifies an HTTP status from a platform publish
 * call — the real signal every one of the three adapters exposes, since
 * TikTok/Instagram/YouTube all report failures as ordinary HTTP status
 * codes on their publish endpoints.
 */
export function classifyPublishHttpFailure(status: number, isQuotaError: boolean): PublishFailureKind {
  if (isQuotaError) return "quota";
  if (status === 429) return "transient"; // rate limit — the platform is telling us to slow down and retry, not that the post is invalid
  if (status >= 500) return "transient";
  if (status === 401 || status === 403) return "terminal"; // token invalid/revoked — no amount of retrying fixes this; the reconnect flow (STEP 11) is the remedy
  if (status >= 400) return "terminal";
  return "transient";
}

export function classifyPublishNetworkFailure(): PublishFailureKind {
  return "transient"; // a network-level failure (timeout, DNS, connection reset) — always worth retrying
}
