import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSessionCookieHeader, sessionCookieHeader } from "../auth-cookie";

describe("auth-cookie (post-STEP-22 audit remediation)", () => {
  it("sessionCookieHeader embeds the refresh token, is httpOnly, and expires in 30 days", () => {
    const header = sessionCookieHeader("a-real-refresh-token");
    expect(header).toContain("velocity_session=a-real-refresh-token");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
  });

  it("clearSessionCookieHeader empties the value and expires immediately", () => {
    const header = clearSessionCookieHeader();
    expect(header).toContain("velocity_session=;");
    expect(header).toContain("Max-Age=0");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("never sets Secure outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(sessionCookieHeader("t")).not.toContain("Secure");
  });

  it("sets Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieHeader("t")).toContain("Secure");
  });
});
