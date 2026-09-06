import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { issueAccessToken, issueRefreshToken, verifySessionToken } from "../session-tokens";

const SECRET = "test-secret-at-least-32-bytes-long-for-hs256!!";

describe("session tokens", () => {
  it("issues and verifies an access token round-trip", async () => {
    const token = await issueAccessToken({ sub: "user-1", sessionId: "session-1" }, SECRET);
    const payload = await verifySessionToken(token, SECRET);
    expect(payload.sub).toBe("user-1");
    expect(payload.sessionId).toBe("session-1");
  });

  it("issues and verifies a refresh token round-trip", async () => {
    const token = await issueRefreshToken({ sub: "user-2", sessionId: "session-2" }, SECRET);
    const payload = await verifySessionToken(token, SECRET);
    expect(payload.sub).toBe("user-2");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await issueAccessToken({ sub: "user-1", sessionId: "session-1" }, SECRET);
    await expect(verifySessionToken(token, "a-completely-different-secret-value")).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({ sub: "user-1", sessionId: "session-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySessionToken(expired, SECRET)).rejects.toThrow();
  });

  it("rejects a token missing sessionId", async () => {
    const malformed = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySessionToken(malformed, SECRET)).rejects.toThrow(/malformed/i);
  });
});
