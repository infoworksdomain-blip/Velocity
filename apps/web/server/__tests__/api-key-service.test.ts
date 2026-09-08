// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiKey, hasScope, listApiKeys, revokeApiKey, verifyApiKey } from "../api-key-service";

/**
 * The Public API's key-custody mechanism (STEP 16), proven against real
 * PGlite. Never stores the raw key — only its SHA-256 hash — the same
 * custody discipline as webhook secrets and platform_credentials.
 */
describe("API key service", () => {
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

  it("creates a key and returns the raw key exactly once", async () => {
    const result = await createApiKey({ workspaceId, scopes: ["automations:read"] }, testDb.admin);
    expect(result.rawKey).toMatch(/^vk_live_/);

    const listed = await listApiKeys(workspaceId, testDb.admin);
    const match = listed.find((k) => k.id === result.id);
    expect(match).toBeDefined();
    expect(match).not.toHaveProperty("keyHash"); // never returned after creation
  });

  it("verifies a real, unrevoked key and returns its workspace and scopes", async () => {
    const { rawKey } = await createApiKey({ workspaceId, scopes: ["credits:read"] }, testDb.admin);
    const verified = await verifyApiKey(rawKey, testDb.admin);
    expect(verified).not.toBeNull();
    expect(verified!.workspaceId).toBe(workspaceId);
    expect(verified!.scopes).toEqual(["credits:read"]);
  });

  it("rejects an unknown key", async () => {
    const verified = await verifyApiKey("vk_live_totally_made_up", testDb.admin);
    expect(verified).toBeNull();
  });

  it("rejects a revoked key", async () => {
    const { id, rawKey } = await createApiKey({ workspaceId, scopes: ["*"] }, testDb.admin);
    await revokeApiKey(workspaceId, id, testDb.admin);
    const verified = await verifyApiKey(rawKey, testDb.admin);
    expect(verified).toBeNull();
  });

  it("rejects revoking a key from a different workspace", async () => {
    const otherWorkspaceId = randomUUID();
    const otherOrgId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: otherOrgId, name: "Other Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: otherWorkspaceId, organisationId: otherOrgId, name: "Other WS", workspaceType: "business" });
    const { id } = await createApiKey({ workspaceId: otherWorkspaceId, scopes: ["*"] }, testDb.admin);

    await expect(revokeApiKey(workspaceId, id, testDb.admin)).rejects.toThrow();
  });

  it("hasScope: a wildcard scope grants any permission; a specific scope grants only itself", () => {
    expect(hasScope({ id: "k1", workspaceId: "w1", scopes: ["*"] }, "anything:at:all")).toBe(true);
    expect(hasScope({ id: "k1", workspaceId: "w1", scopes: ["automations:read"] }, "automations:read")).toBe(true);
    expect(hasScope({ id: "k1", workspaceId: "w1", scopes: ["automations:read"] }, "automations:write")).toBe(false);
  });
});
