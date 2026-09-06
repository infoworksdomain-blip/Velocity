import { describe, expect, it, vi } from "vitest";
import {
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  type GoogleOAuthConfig,
} from "../google";

const config: GoogleOAuthConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "https://app.velocity.test/api/auth/google/callback",
};

describe("Google OAuth adapter", () => {
  it("builds an authorization URL with the required query parameters", () => {
    const url = new URL(buildGoogleAuthorizationUrl(config, "state-123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("exchanges an authorization code for tokens against a fixture response", async () => {
    const fixtureResponse = {
      access_token: "fixture-access-token",
      id_token: "fixture-id-token",
      refresh_token: "fixture-refresh-token",
    };
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://oauth2.googleapis.com/token");
      expect(init?.method).toBe("POST");
      const body = new URLSearchParams(init?.body as string);
      expect(body.get("code")).toBe("auth-code-abc");
      expect(body.get("grant_type")).toBe("authorization_code");
      return new Response(JSON.stringify(fixtureResponse), { status: 200 });
    });

    const result = await exchangeGoogleAuthorizationCode(config, "auth-code-abc", fetchMock as unknown as typeof fetch);
    expect(result).toEqual({
      accessToken: "fixture-access-token",
      idToken: "fixture-id-token",
      refreshToken: "fixture-refresh-token",
    });
  });

  it("throws with the response body when the token exchange fails", async () => {
    const fetchMock = vi.fn(
      async () => new Response("invalid_grant", { status: 400, statusText: "Bad Request" }),
    );
    await expect(
      exchangeGoogleAuthorizationCode(config, "bad-code", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/400/);
  });

  it("fetches user info against a fixture response", async () => {
    const fixtureUser = {
      sub: "1234567890",
      email: "owner@demo.velocity",
      email_verified: true,
      name: "Demo Owner",
    };
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openidconnect.googleapis.com/v1/userinfo");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer fixture-access-token");
      return new Response(JSON.stringify(fixtureUser), { status: 200 });
    });

    const user = await fetchGoogleUserInfo("fixture-access-token", fetchMock as unknown as typeof fetch);
    expect(user).toEqual(fixtureUser);
  });
});
