// @vitest-environment node
import { randomUUID } from "node:crypto";
import { auth } from "@velocity/core";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashResetToken, requestPasswordReset, resetPassword } from "../auth-service";

/**
 * Post-STEP-22 audit remediation: the real password-reset flow, proven
 * against real PGlite the same way every other db-parameter service in
 * this codebase is (compliance-service.test.ts, etc.) — no live Postgres
 * needed. The email provider is a fake here since ResendEmailProvider's
 * own real-SDK-against-a-local-server behavior is already covered by
 * packages/core/src/auth/__tests__/email-provider.test.ts; this suite's
 * job is proving the token lifecycle and the "don't leak whether an
 * account exists" shape, not re-proving email delivery.
 */
describe("auth-service — password reset (post-STEP-22 audit remediation)", () => {
  let testDb: PgliteTestDb;
  let userId: string;
  let sentMessages: Array<{ to: string; subject: string; text: string }>;
  let fakeEmailProvider: auth.EmailProvider;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    userId = randomUUID();
    await testDb.admin.insert(schema.users).values({ id: userId, email: "reset-me@example.com", name: "Reset Me", passwordHash: await auth.hashPassword("old-password-123") });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(() => {
    sentMessages = [];
    fakeEmailProvider = {
      id: "fake",
      send: vi.fn(async (message) => {
        sentMessages.push({ to: message.to, subject: message.subject, text: message.text });
        return { messageId: "fake-id" };
      }),
    };
  });

  it("sends a reset email with a real, single-use token embedded in the link for a known email", async () => {
    await requestPasswordReset("reset-me@example.com", testDb.admin, fakeEmailProvider);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]?.to).toBe("reset-me@example.com");
    const match = sentMessages[0]?.text.match(/token=([a-f0-9]{64})/);
    expect(match).not.toBeNull();
  });

  it("returns { ok: true } and sends nothing for an email with no account (never leaks existence)", async () => {
    const result = await requestPasswordReset("nobody-here@example.com", testDb.admin, fakeEmailProvider);

    expect(result).toEqual({ ok: true });
    expect(sentMessages).toHaveLength(0);
  });

  it("lets a valid token change the password and rejects the same token on reuse", async () => {
    await requestPasswordReset("reset-me@example.com", testDb.admin, fakeEmailProvider);
    const token = sentMessages[0]!.text.match(/token=([a-f0-9]{64})/)![1]!;

    await resetPassword(token, "brand-new-password-456", testDb.admin);

    const rows = await testDb.admin.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    expect(await auth.verifyPassword("brand-new-password-456", rows[0]!.passwordHash!)).toBe(true);
    expect(await auth.verifyPassword("old-password-123", rows[0]!.passwordHash!)).toBe(false);

    await expect(resetPassword(token, "another-password-789", testDb.admin)).rejects.toThrow("INVALID_OR_EXPIRED_RESET_TOKEN");
  });

  it("rejects an unknown token", async () => {
    await expect(resetPassword("a".repeat(64), "whatever-password", testDb.admin)).rejects.toThrow("INVALID_OR_EXPIRED_RESET_TOKEN");
  });

  it("revokes every existing session for the account on a successful reset", async () => {
    const otherUserId = randomUUID();
    await testDb.admin.insert(schema.users).values({ id: otherUserId, email: "sessions-user@example.com", passwordHash: await auth.hashPassword("pw") });
    const sessionId = randomUUID();
    await testDb.admin.insert(schema.sessions).values({ id: sessionId, userId: otherUserId, refreshTokenHash: "h", expiresAt: new Date(Date.now() + 86400000) });

    await requestPasswordReset("sessions-user@example.com", testDb.admin, fakeEmailProvider);
    const token = sentMessages[0]!.text.match(/token=([a-f0-9]{64})/)![1]!;
    await resetPassword(token, "yet-another-password", testDb.admin);

    const sessionRows = await testDb.admin.select({ revokedAt: schema.sessions.revokedAt }).from(schema.sessions).where(eq(schema.sessions.id, sessionId)).limit(1);
    expect(sessionRows[0]?.revokedAt).not.toBeNull();
  });

  it("hashResetToken is deterministic (same input -> same hash) so a lookup by hash actually finds the row", () => {
    expect(hashResetToken("abc")).toBe(hashResetToken("abc"));
    expect(hashResetToken("abc")).not.toBe(hashResetToken("abd"));
  });
});
