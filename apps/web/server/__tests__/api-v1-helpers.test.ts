// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiKey } from "../api-key-service";
import { ApiAuthError, authenticateApiRequest } from "../api-v1-helpers";

/**
 * STEP 20: real, DB-backed API-key rate limiting closes the gap STEP 16
 * originally, honestly flagged as unimplemented ("no production
 * rate-limiter infra like Redis"). Proven against real PGlite, not a
 * mocked limiter.
 */
describe("authenticateApiRequest — rate limiting (STEP 20)", () => {
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

  function bearerRequest(rawKey: string): Request {
    return new Request("https://api.velocity.test/v1/credits", { headers: { authorization: `Bearer ${rawKey}` } });
  }

  it("authenticates a valid, correctly-scoped key under the rate limit", async () => {
    const { rawKey } = await createApiKey({ workspaceId, scopes: ["credits:read"] }, testDb.admin);
    const verified = await authenticateApiRequest(bearerRequest(rawKey), "credits:read", testDb.admin);
    expect(verified.workspaceId).toBe(workspaceId);
  });

  it("rejects a missing Authorization header with 401, before ever touching the rate limiter", async () => {
    await expect(authenticateApiRequest(new Request("https://api.velocity.test/v1/credits"), "credits:read", testDb.admin)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects an out-of-scope key with 403", async () => {
    const { rawKey } = await createApiKey({ workspaceId, scopes: ["automations:read"] }, testDb.admin);
    await expect(authenticateApiRequest(bearerRequest(rawKey), "credits:read", testDb.admin)).rejects.toMatchObject({ status: 403 });
  });

  it("rate-limits a key that exceeds its per-window request cap with a real 429", async () => {
    const { rawKey } = await createApiKey({ workspaceId, scopes: ["credits:read"] }, testDb.admin);

    // The real cap is 120/60s (api-v1-helpers.ts) — rather than looping
    // 120 times, drive the SAME underlying bucket key directly to just
    // under the cap first, then prove the very next real call through
    // authenticateApiRequest is the one that tips it over.
    const verified = await authenticateApiRequest(bearerRequest(rawKey), "credits:read", testDb.admin);
    const { security } = await import("@velocity/core");
    for (let i = 0; i < 118; i++) {
      await security.checkAndIncrementRateLimit(testDb.admin, { bucketKey: `api_key:${verified.id}`, windowSeconds: 60, requestCap: 120 });
    }
    // 1 (already made) + 118 = 119 consumed — one more real call should be the 120th (still allowed)...
    await expect(authenticateApiRequest(bearerRequest(rawKey), "credits:read", testDb.admin)).resolves.toBeDefined();
    // ...and the NEXT one (121st) must be rejected with 429.
    await expect(authenticateApiRequest(bearerRequest(rawKey), "credits:read", testDb.admin)).rejects.toMatchObject({ status: 429 });
  });

  it("two different API keys have entirely independent rate-limit buckets", async () => {
    const key1 = await createApiKey({ workspaceId, scopes: ["credits:read"] }, testDb.admin);
    const key2 = await createApiKey({ workspaceId, scopes: ["credits:read"] }, testDb.admin);

    const { security } = await import("@velocity/core");
    const verified1 = await authenticateApiRequest(bearerRequest(key1.rawKey), "credits:read", testDb.admin);
    for (let i = 0; i < 119; i++) {
      await security.checkAndIncrementRateLimit(testDb.admin, { bucketKey: `api_key:${verified1.id}`, windowSeconds: 60, requestCap: 120 });
    }
    await expect(authenticateApiRequest(bearerRequest(key1.rawKey), "credits:read", testDb.admin)).rejects.toMatchObject({ status: 429 });

    // key2 is a fresh bucket — unaffected by key1's exhaustion.
    await expect(authenticateApiRequest(bearerRequest(key2.rawKey), "credits:read", testDb.admin)).resolves.toBeDefined();
  });
});

describe("ApiAuthError", () => {
  it("carries a real HTTP status code", () => {
    const error = new ApiAuthError(429, "too many requests");
    expect(error.status).toBe(429);
    expect(error.message).toBe("too many requests");
  });
});
