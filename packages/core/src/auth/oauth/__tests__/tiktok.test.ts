import { describe, expect, it, vi } from "vitest";
import { buildTikTokAuthorizationUrl, exchangeTikTokAuthorizationCode, fetchTikTokUserInfo, refreshTikTokAccessToken, type TikTokOAuthConfig } from "../tiktok";

const config: TikTokOAuthConfig = { clientKey: "test-client-key", clientSecret: "test-client-secret", redirectUri: "https://app.velocity.test/api/oauth/tiktok/callback" };

describe("TikTok OAuth adapter", () => {
  it("builds an authorization URL with the required scopes", () => {
    const url = new URL(buildTikTokAuthorizationUrl(config, "state-123"));
    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(url.searchParams.get("client_key")).toBe(config.clientKey);
    expect(url.searchParams.get("scope")).toContain("video.publish");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("exchanges an authorization code for tokens against a fixture response", async () => {
    const fixture = { access_token: "at", refresh_token: "rt", expires_in: 86400, refresh_expires_in: 31536000, open_id: "open-1", scope: "user.info.basic,video.publish", token_type: "Bearer" };
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://open.tiktokapis.com/v2/oauth/token/");
      const body = new URLSearchParams(init?.body as string);
      expect(body.get("code")).toBe("code-abc");
      expect(body.get("grant_type")).toBe("authorization_code");
      return new Response(JSON.stringify(fixture), { status: 200 });
    });
    const result = await exchangeTikTokAuthorizationCode(config, "code-abc", fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ accessToken: "at", refreshToken: "rt", expiresInSec: 86400, refreshExpiresInSec: 31536000, openId: "open-1", scope: "user.info.basic,video.publish" });
  });

  it("throws on a TikTok-shaped error payload even when the HTTP status is 200 (TikTok reports some errors this way)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "code expired" }), { status: 200 }));
    await expect(exchangeTikTokAuthorizationCode(config, "bad-code", fetchMock as unknown as typeof fetch)).rejects.toThrow(/invalid_grant/);
  });

  it("refreshes the access token, using the refresh_token grant", async () => {
    const fixture = { access_token: "new-at", refresh_token: "new-rt", expires_in: 86400, refresh_expires_in: 31536000, open_id: "open-1", scope: "video.publish", token_type: "Bearer" };
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = new URLSearchParams(init?.body as string);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("old-rt");
      return new Response(JSON.stringify(fixture), { status: 200 });
    });
    const result = await refreshTikTokAccessToken(config, "old-rt", fetchMock as unknown as typeof fetch);
    // TikTok rotates refresh tokens on every refresh — the NEW one must come back, not the old one silently reused.
    expect(result.refreshToken).toBe("new-rt");
  });

  it("fetches user info for the account-health check", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("https://open.tiktokapis.com/v2/user/info/");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
      return new Response(JSON.stringify({ data: { user: { open_id: "open-1", display_name: "Demo Biz" } }, error: { code: "ok", message: "" } }), { status: 200 });
    });
    const info = await fetchTikTokUserInfo("at-1", fetchMock as unknown as typeof fetch);
    expect(info.openId).toBe("open-1");
    expect(info.displayName).toBe("Demo Biz");
  });

  it("throws when the token is invalid — the real signal routers/social.ts's health check reacts to", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {}, error: { code: "access_token_invalid", message: "token expired" } }), { status: 200 }));
    await expect(fetchTikTokUserInfo("expired-token", fetchMock as unknown as typeof fetch)).rejects.toThrow(/access_token_invalid/);
  });
});
