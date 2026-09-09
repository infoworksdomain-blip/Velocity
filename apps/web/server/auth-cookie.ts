import { SESSION_COOKIE_NAME } from "./context";

/**
 * Post-STEP-22 audit remediation: authRouter.login/signup (STEP 3) always
 * returned tokens as plain mutation output, but nothing anywhere ever set
 * the `velocity_session` cookie context.ts reads — there was no login/
 * signup page at all (confirmed absent from apps/web/app/), so the whole
 * cookie-issuing half of this codebase's own auth design was unreachable.
 *
 * The refresh token (30-day JWT exp, matching `sessions.expiresAt`) is
 * what's stored here, not the 15-minute access token — this codebase has
 * no silent access-token-refresh rotation flow, and issuing a cookie that
 * stops working after 15 minutes with no way to renew it would make the
 * session useless. `context.ts`'s verifySessionToken call works
 * identically for either token (same secret, same {sub, sessionId}
 * payload shape) — using the longer-lived one here is a deliberate,
 * documented simplification, not a hidden shortcut. Real short-lived-
 * access-token rotation (silent re-auth before the 15-minute window
 * closes) is a further, separate improvement this pass does not build.
 */
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieHeader(refreshToken: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${refreshToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
