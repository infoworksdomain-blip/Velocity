import { jwtVerify, SignJWT, type JWTPayload } from "jose";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionTokenPayload extends JWTPayload {
  /** User id. */
  sub: string;
  /** Maps to sessions.id (packages/db/src/schema/auth.ts) — revocation is checked against that row, not just the token's own expiry. */
  sessionId: string;
}

function getKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function issueAccessToken(payload: SessionTokenPayload, secret: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS)
    .sign(getKey(secret));
}

export async function issueRefreshToken(payload: SessionTokenPayload, secret: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SECONDS)
    .sign(getKey(secret));
}

/** Throws on an invalid signature, expired token, or malformed payload — callers must still check the referenced session row hasn't been revoked. */
export async function verifySessionToken(token: string, secret: string): Promise<SessionTokenPayload> {
  const { payload } = await jwtVerify(token, getKey(secret));
  if (typeof payload.sub !== "string" || typeof payload.sessionId !== "string") {
    throw new Error("Malformed session token payload");
  }
  return payload as SessionTokenPayload;
}
