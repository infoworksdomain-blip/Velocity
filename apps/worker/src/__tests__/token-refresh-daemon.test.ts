import { randomUUID } from "node:crypto";
import { notifications } from "@velocity/core";
import { schema, LocalDevKmsProvider } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runTokenRefreshTick } from "../jobs/token-refresh-daemon.js";

const KMS_KEY = "a".repeat(64); // a valid 32-byte hex key — this is a test fixture, not a real secret

const CONFIGS = {
  tiktok: { clientKey: "test-client-key", clientSecret: "test-secret", redirectUri: "https://app.test/callback/tiktok" },
  instagram: { appId: "test-app-id", appSecret: "test-app-secret", redirectUri: "https://app.test/callback/instagram" },
  youtube: { clientId: "test-client-id", clientSecret: "test-client-secret", redirectUri: "https://app.test/callback/youtube" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * GATE 11's daemon proof: fast-forward `now` relative to a fixed
 * `expiresAt` rather than waiting on real wall-clock time — the same
 * technique `token-refresh.test.ts` already uses for the threshold table.
 */
describe("runTokenRefreshTick — against a real embedded Postgres (PGlite)", () => {
  let testDb: PgliteTestDb;
  let kms: LocalDevKmsProvider;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();
    kms = new LocalDevKmsProvider(KMS_KEY);

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    userId = randomUUID();
    const roleId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "WS", workspaceType: "business" });
    await testDb.admin.insert(schema.users).values({ id: userId, email: "owner@example.com" });
    await testDb.admin.insert(schema.roles).values({ id: roleId, scope: "workspace", key: "owner", name: "Owner", permissions: [] });
    await testDb.admin.insert(schema.memberships).values({ workspaceId, userId, roleId });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  // The daemon's own query is intentionally global (no workspace filter — a
  // real daemon tick processes every workspace). Track every account this
  // file seeds and retire it after its test so a later test's `now` can't
  // sweep up an earlier test's still-"connected" row.
  const seededAccountIds: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const id of seededAccountIds) {
      await testDb.admin.update(schema.socialAccounts).set({ connectionStatus: "disconnected" }).where(eq(schema.socialAccounts.id, id));
    }
    seededAccountIds.length = 0;
  });

  async function seedTikTokAccount(expiresAt: Date | null, connectionStatus: "connected" | "reauth_required" = "connected") {
    const socialAccountId = randomUUID();
    seededAccountIds.push(socialAccountId);
    await testDb.admin.insert(schema.socialAccounts).values({ id: socialAccountId, workspaceId, platform: "tiktok", externalAccountId: `ext-${socialAccountId}`, connectionStatus });
    const { ciphertext, keyId } = await kms.encrypt(JSON.stringify({ accessToken: "old-access-token", refreshMaterial: "old-refresh-token", resourceId: null }));
    await testDb.admin.insert(schema.platformCredentials).values({ id: randomUUID(), workspaceId, socialAccountId, encryptedPayload: ciphertext, kmsKeyId: keyId, expiresAt });
    return socialAccountId;
  }

  it("refreshes a token nearing expiry and keeps the account connected", async () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const expiresAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // T-2, within the T-3 refresh window
    const socialAccountId = await seedTikTokAccount(expiresAt);

    const notified: notifications.NotificationEvent[] = [];
    const unsubscribe = notifications.subscribe("token_expiring", (event) => {
      notified.push(event);
    });

    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 86400,
        refresh_expires_in: 2592000,
        open_id: "open-1",
        scope: "user.info.basic,video.publish,video.upload",
        token_type: "Bearer",
      }),
    );

    const result = await runTokenRefreshTick({ db: testDb.admin, kms, configs: CONFIGS, fetchImpl: fetchImpl as unknown as typeof fetch, now });
    unsubscribe();

    expect(result.refreshed).toEqual([socialAccountId]);
    expect(result.reauthRequired).toEqual([]);

    const [account] = await testDb.admin.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id, socialAccountId));
    expect(account!.connectionStatus).toBe("connected");

    const [credential] = await testDb.admin.select().from(schema.platformCredentials).where(eq(schema.platformCredentials.socialAccountId, socialAccountId));
    const decrypted = JSON.parse(await kms.decrypt(credential!.encryptedPayload, credential!.kmsKeyId)) as { accessToken: string; refreshMaterial: string };
    expect(decrypted.accessToken).toBe("new-access-token");
    expect(decrypted.refreshMaterial).toBe("new-refresh-token"); // TikTok rotates refresh tokens — the daemon must persist the NEW one, not the old

    // new expiry (now + 86400s) is itself within a day, so a real T-1 notification should fire for the account's NEXT expiry
    expect(notified).toHaveLength(1);
    expect(notified[0]!.workspaceId).toBe(workspaceId);
    expect(notified[0]!.userId).toBe(userId);
  });

  it("marks the account reauth_required and notifies when the refresh call fails (a revoked token)", async () => {
    const now = new Date("2026-06-02T12:00:00Z");
    const expiresAt = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // T-1
    const socialAccountId = await seedTikTokAccount(expiresAt);

    const notified: notifications.NotificationEvent[] = [];
    const unsubscribe = notifications.subscribe("account_reauth_required", (event) => {
      notified.push(event);
    });

    const fetchImpl = vi.fn(async () => jsonResponse({ error: "invalid_grant", error_description: "refresh token has been revoked" }, 400));

    const result = await runTokenRefreshTick({ db: testDb.admin, kms, configs: CONFIGS, fetchImpl: fetchImpl as unknown as typeof fetch, now });
    unsubscribe();

    expect(result.reauthRequired).toEqual([socialAccountId]);
    expect(result.refreshed).toEqual([]);

    const [account] = await testDb.admin.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id, socialAccountId));
    expect(account!.connectionStatus).toBe("reauth_required");

    expect(notified).toHaveLength(1);
    expect(notified[0]!.type).toBe("account_reauth_required");
    expect(notified[0]!.userId).toBe(userId);
  });

  it("skips an account whose token isn't yet near expiry", async () => {
    const now = new Date("2026-06-03T12:00:00Z");
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // far in the future
    await seedTikTokAccount(expiresAt);

    const fetchImpl = vi.fn();
    const result = await runTokenRefreshTick({ db: testDb.admin, kms, configs: CONFIGS, fetchImpl: fetchImpl as unknown as typeof fetch, now });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("skips accounts that are already reauth_required rather than retrying them", async () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const expiresAt = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    await seedTikTokAccount(expiresAt, "reauth_required");

    const fetchImpl = vi.fn();
    const result = await runTokenRefreshTick({ db: testDb.admin, kms, configs: CONFIGS, fetchImpl: fetchImpl as unknown as typeof fetch, now });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.refreshed).toEqual([]);
    expect(result.reauthRequired).toEqual([]);
  });
});
