import { auth } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, eq, isNull } from "drizzle-orm";
import { getAdminDb } from "./db";

export const SESSION_COOKIE_NAME = "velocity_session";

export interface AuthenticatedUser {
  id: string;
  email: string;
  platformRoleKey: string | null;
}

export interface Context {
  sessionId: string | null;
  user: AuthenticatedUser | null;
  /** Raw `x-workspace-id` header, unresolved/unauthorized — requireWorkspacePermission (trpc.ts) is what turns this into a checked membership+role. */
  workspaceIdHeader: string | null;
}

function parseCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Resolves the caller from the session cookie: verify the JWT, then check
 * the referenced `sessions` row hasn't been revoked or expired — the JWT's
 * own expiry is necessary but not sufficient, since a revoked session's
 * token would otherwise still verify until it naturally expires.
 */
export async function createContext(req: Request): Promise<Context> {
  const workspaceIdHeader = req.headers.get("x-workspace-id");
  const emptyContext: Context = { sessionId: null, user: null, workspaceIdHeader };

  const authSecret = process.env.AUTH_SECRET;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const token = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!token || !authSecret) return emptyContext;

  let sessionId: string;
  let userId: string;
  try {
    const payload = await auth.verifySessionToken(token, authSecret);
    sessionId = payload.sessionId;
    userId = payload.sub;
  } catch {
    return emptyContext;
  }

  const rows = await getAdminDb()
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      platformRoleKey: schema.roles.key,
      revokedAt: schema.sessions.revokedAt,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .leftJoin(schema.roles, eq(schema.roles.id, schema.users.platformRoleId))
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row || row.expiresAt < new Date()) return emptyContext;

  return {
    sessionId,
    user: { id: row.userId, email: row.email, platformRoleKey: row.platformRoleKey },
    workspaceIdHeader,
  };
}
