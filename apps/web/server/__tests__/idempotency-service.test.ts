// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withIdempotency } from "../idempotency-service";

/**
 * The Public API's generic Idempotency-Key mechanism (STEP 16), proven
 * against real PGlite — the build script's own literal "idempotency keys
 * on writes" requirement.
 */
describe("withIdempotency", () => {
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

  it("runs the handler exactly once for a fresh key", async () => {
    const handler = vi.fn(async () => ({ statusCode: 201, body: { created: "resource-1" } }));
    const result = await withIdempotency(testDb.admin, workspaceId, "key-1", handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ statusCode: 201, body: { created: "resource-1" } });
  });

  it("replays the cached response on a retried request with the same key, without re-running the handler", async () => {
    const handler = vi.fn(async () => ({ statusCode: 201, body: { created: `resource-${randomUUID()}` } }));
    const first = await withIdempotency(testDb.admin, workspaceId, "key-2", handler);
    const second = await withIdempotency(testDb.admin, workspaceId, "key-2", handler);

    expect(handler).toHaveBeenCalledTimes(1); // the second call never invoked the handler again
    expect(second).toEqual(first); // the exact same cached response, including the random id from the FIRST call
  });

  it("treats the same idempotency key as independent across different workspaces", async () => {
    const otherWorkspaceId = randomUUID();
    const otherOrgId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: otherOrgId, name: "Other Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: otherWorkspaceId, organisationId: otherOrgId, name: "Other WS", workspaceType: "business" });

    const handlerA = vi.fn(async () => ({ statusCode: 201, body: { owner: "A" } }));
    const handlerB = vi.fn(async () => ({ statusCode: 201, body: { owner: "B" } }));

    const resultA = await withIdempotency(testDb.admin, workspaceId, "shared-key", handlerA);
    const resultB = await withIdempotency(testDb.admin, otherWorkspaceId, "shared-key", handlerB);

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(resultA.body).toEqual({ owner: "A" });
    expect(resultB.body).toEqual({ owner: "B" });
  });

  it("a different key for the same workspace runs the handler independently", async () => {
    const handler = vi.fn(async () => ({ statusCode: 200, body: { ok: true } }));
    await withIdempotency(testDb.admin, workspaceId, "key-3a", handler);
    await withIdempotency(testDb.admin, workspaceId, "key-3b", handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
