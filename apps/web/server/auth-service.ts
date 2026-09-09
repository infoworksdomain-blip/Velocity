import { createHash, randomBytes, randomUUID } from "node:crypto";
import { auth, security } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";

/**
 * Post-STEP-22 audit remediation: a real password-reset flow, extracted
 * into its own service module (rather than living inline in
 * routers/auth.ts) to follow this codebase's own established
 * db-parameter-with-a-real-default pattern (compliance-service.ts,
 * analytics-service.ts, etc.) — the same shape that makes every one of
 * those directly testable against real PGlite instead of a live Postgres.
 */
export type AuthServiceDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS = 3600;
const PASSWORD_RESET_RATE_LIMIT_CAP = 5;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Always resolves to { ok: true } regardless of whether the email matches
 * an account — the same "don't leak whether this email exists" discipline
 * login's dummy-hash comparison already established.
 */
export async function requestPasswordReset(
  email: string,
  db: AuthServiceDb = getAdminDb(),
  emailProvider: auth.EmailProvider = auth.createEmailProvider(),
): Promise<{ ok: true }> {
  const rateLimit = await security.checkAndIncrementRateLimit(db, {
    bucketKey: `password_reset:email:${email.toLowerCase()}`,
    windowSeconds: PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS,
    requestCap: PASSWORD_RESET_RATE_LIMIT_CAP,
  });
  if (!rateLimit.allowed) return { ok: true };

  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const user = rows[0];
  if (!user) return { ok: true };

  const token = randomBytes(32).toString("hex");
  await db.insert(schema.passwordResetTokens).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  });

  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const resetUrl = `${appBaseUrl}/reset-password?token=${token}`;
  await emailProvider.send({
    to: email,
    subject: "Reset your VELOCITY password",
    text: `We received a request to reset your password. This link expires in 15 minutes:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>We received a request to reset your password. This link expires in 15 minutes:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
  });

  return { ok: true };
}

/**
 * Single-use, 15-minute token. Revokes every existing session for the
 * account on success — a password reset is a real security event, so any
 * session issued under the old password shouldn't silently survive it.
 */
export async function resetPassword(token: string, newPassword: string, db: AuthServiceDb = getAdminDb()): Promise<{ ok: true }> {
  const tokenHash = hashResetToken(token);
  const rows = await db
    .select({ id: schema.passwordResetTokens.id, userId: schema.passwordResetTokens.userId })
    .from(schema.passwordResetTokens)
    .where(and(eq(schema.passwordResetTokens.tokenHash, tokenHash), isNull(schema.passwordResetTokens.usedAt), gt(schema.passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  const resetToken = rows[0];
  if (!resetToken) {
    throw new Error("INVALID_OR_EXPIRED_RESET_TOKEN");
  }

  const passwordHash = await auth.hashPassword(newPassword);
  await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, resetToken.userId));
  await db.update(schema.passwordResetTokens).set({ usedAt: new Date() }).where(eq(schema.passwordResetTokens.id, resetToken.id));
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, resetToken.userId), isNull(schema.sessions.revokedAt)));

  return { ok: true };
}
