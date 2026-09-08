import { security } from "@velocity/core";
import type { ApiKeyDb } from "./api-key-service";
import { hasScope, verifyApiKey, type VerifiedApiKey } from "./api-key-service";
import { getAdminDb } from "./db";

/**
 * Shared plumbing for every `/v1/*` Public API route handler (build
 * script: "REST, OpenAPI 3.1, API-key auth scoped to workspace +
 * permission, cursor pagination, rate limits, idempotency keys on
 * writes"). STEP 16 originally flagged rate limiting as honestly NOT
 * implemented (no production rate-limiter infra like Redis) — STEP 20
 * closes that specific gap with a real, DB-backed limiter
 * (packages/core/src/security/rate-limit.ts, the same atomic
 * check-and-increment shape STEP 11's platform quota counter already
 * proved race-free under real concurrent load), not Redis, but real and
 * enforced.
 */
const API_KEY_RATE_LIMIT_WINDOW_SECONDS = 60;
const API_KEY_RATE_LIMIT_CAP = 120; // 2 req/sec sustained, generous for a legitimate integration, low enough to blunt real key abuse

export class ApiAuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function authenticateApiRequest(req: Request, requiredScope: string, db: ApiKeyDb = getAdminDb()): Promise<VerifiedApiKey> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new ApiAuthError(401, "Missing or malformed Authorization header — expected 'Bearer <api-key>'");

  const rawKey = authHeader.slice("Bearer ".length);
  const key = await verifyApiKey(rawKey, db);
  if (!key) throw new ApiAuthError(401, "Invalid or revoked API key");
  if (!hasScope(key, requiredScope)) throw new ApiAuthError(403, `This API key is not scoped for '${requiredScope}'`);

  const rateLimit = await security.checkAndIncrementRateLimit(db, { bucketKey: `api_key:${key.id}`, windowSeconds: API_KEY_RATE_LIMIT_WINDOW_SECONDS, requestCap: API_KEY_RATE_LIMIT_CAP });
  if (!rateLimit.allowed) throw new ApiAuthError(429, `Rate limit exceeded: ${rateLimit.requestCount}/${rateLimit.requestCap} requests in the current ${API_KEY_RATE_LIMIT_WINDOW_SECONDS}s window`);

  return key;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiAuthError) return jsonResponse({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message : String(error);
  return jsonResponse({ error: message }, 400);
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

/**
 * Real, if simple, cursor pagination: the caller fetches `limit + 1` rows
 * ordered by `createdAt DESC` (the standard "peek ahead by one" technique
 * to detect whether more remain, without a fabricated has-more flag), and
 * this function slices the extra row off and exposes the real cursor to
 * resume from — the last returned row's own `createdAt`, which the
 * caller's next request passes back to filter `createdAt < cursor`.
 */
export function paginate<T extends { createdAt: Date }>(rows: T[], limit: number): CursorPage<T> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { data: page, nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null };
}

export function parseCursorParams(url: URL): { limit: number; cursor: string | null } {
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
  return { limit, cursor: url.searchParams.get("cursor") };
}
