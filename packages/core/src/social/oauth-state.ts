import { jwtVerify, SignJWT, type JWTPayload } from "jose";

/**
 * Signed `state` parameter for the STEP 11 OAuth connect flows — the
 * standard CSRF-protection technique for the OAuth `state` param, reusing
 * the same jose (`SignJWT`/`jwtVerify`) pattern as
 * packages/core/src/auth/session-tokens.ts, rather than a new "oauth
 * states" DB table: the state only needs to prove "this callback
 * corresponds to a request we actually issued, for this workspace/user/
 * platform, recently" — a short-lived signed token does that without any
 * server-side storage or cleanup job.
 */
const STATE_TTL_SECONDS = 10 * 60;

export interface OAuthStatePayload extends JWTPayload {
  workspaceId: string;
  userId: string;
  platform: "tiktok" | "instagram" | "youtube";
}

function getKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function issueOAuthState(payload: OAuthStatePayload, secret: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS)
    .sign(getKey(secret));
}

/** Throws on an invalid signature, expired state, or malformed payload — a callback with a bad/expired/tampered state must be rejected outright, never silently treated as "no state." */
export async function verifyOAuthState(token: string, secret: string): Promise<OAuthStatePayload> {
  const { payload } = await jwtVerify(token, getKey(secret));
  if (typeof payload.workspaceId !== "string" || typeof payload.userId !== "string" || typeof payload.platform !== "string") {
    throw new Error("Malformed OAuth state payload");
  }
  return payload as OAuthStatePayload;
}
