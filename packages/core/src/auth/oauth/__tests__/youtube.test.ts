import { describe, expect, it, vi } from "vitest";
import { buildYouTubeAuthorizationUrl, exchangeYouTubeAuthorizationCode, fetchYouTubeChannel, refreshYouTubeAccessToken, type YouTubeOAuthConfig } from "../youtube";

const config: YouTubeOAuthConfig = { clientId: "test-client-id", clientSecret: "test-client-secret", redirectUri: "https://app.velocity.test/api/oauth/youtube/callback" };

describe("YouTube OAuth adapter", () => {
  it("builds an authorization URL with youtube.upload scope and offline access", () => {
    const url = new URL(buildYouTubeAuthorizationUrl(config, "state-123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toContain("youtube.upload");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("exchanges an authorization code for tokens", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://oauth2.googleapis.com/token");
      const body = new URLSearchParams(init?.body as string);
      expect(body.get("grant_type")).toBe("authorization_code");
      return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "https://www.googleapis.com/auth/youtube.upload" }), { status: 200 });
    });
    const result = await exchangeYouTubeAuthorizationCode(config, "code-abc", fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ accessToken: "at", refreshToken: "rt", expiresInSec: 3600, scope: "https://www.googleapis.com/auth/youtube.upload" });
  });

  it("keeps the ORIGINAL refresh token when Google's refresh response omits one (Google does not rotate refresh tokens)", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = new URLSearchParams(init?.body as string);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("original-rt");
      // Real Google behavior: no refresh_token field in a refresh response.
      return new Response(JSON.stringify({ access_token: "new-at", expires_in: 3600, scope: "https://www.googleapis.com/auth/youtube.upload" }), { status: 200 });
    });
    const result = await refreshYouTubeAccessToken(config, "original-rt", fetchMock as unknown as typeof fetch);
    expect(result.accessToken).toBe("new-at");
    expect(result.refreshToken).toBe("original-rt");
  });

  it("throws on a Google-shaped error payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 200 }));
    await expect(exchangeYouTubeAuthorizationCode(config, "bad-code", fetchMock as unknown as typeof fetch)).rejects.toThrow(/invalid_grant/);
  });

  it("fetches the user's own channel for the health check (1-quota-unit call)", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get("mine")).toBe("true");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
      return new Response(JSON.stringify({ items: [{ id: "channel-1", snippet: { title: "Demo Biz" } }] }), { status: 200 });
    });
    const channel = await fetchYouTubeChannel("at-1", fetchMock as unknown as typeof fetch);
    expect(channel).toEqual({ channelId: "channel-1", title: "Demo Biz" });
  });

  it("throws a clear error when the token is valid but the channel list is empty, rather than returning undefined silently", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await expect(fetchYouTubeChannel("at-1", fetchMock as unknown as typeof fetch)).rejects.toThrow(/no channel/);
  });

  it("throws on a 401 (revoked token) — the real signal for reauth_required", async () => {
    const fetchMock = vi.fn(async () => new Response("invalid credentials", { status: 401 }));
    await expect(fetchYouTubeChannel("revoked", fetchMock as unknown as typeof fetch)).rejects.toThrow(/401/);
  });
});
