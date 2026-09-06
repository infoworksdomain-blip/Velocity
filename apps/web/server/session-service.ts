import { createHash, randomUUID } from "node:crypto";
import { auth } from "@velocity/core";
import { schema } from "@velocity/db";
import { getAdminDb } from "./db";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CreatedSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: Date;
}

function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues an access+refresh token pair and persists the session row. The
 * refresh token itself is never stored — only its hash — so a leaked
 * database backup can't be replayed as a session, mirroring how passwords
 * are handled (packages/core/src/auth/password.ts).
 */
export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<CreatedSession> {
  const authSecret = requireAuthSecret();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const accessToken = await auth.issueAccessToken({ sub: userId, sessionId }, authSecret);
  const refreshToken = await auth.issueRefreshToken({ sub: userId, sessionId }, authSecret);

  await getAdminDb().insert(schema.sessions).values({
    id: sessionId,
    userId,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
    expiresAt,
  });

  return { accessToken, refreshToken, sessionId, expiresAt };
}
