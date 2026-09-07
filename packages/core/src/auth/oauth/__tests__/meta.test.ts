import { describe, expect, it, vi } from "vitest";
import { buildMetaAuthorizationUrl, exchangeMetaAuthorizationCode, exchangeMetaLongLivedToken, fetchInstagramAccountInfo, fetchLinkedInstagramAccounts, type MetaOAuthConfig } from "../meta";

const config: MetaOAuthConfig = { appId: "test-app-id", appSecret: "test-app-secret", redirectUri: "https://app.velocity.test/api/oauth/meta/callback" };

describe("Meta OAuth adapter", () => {
  it("builds an authorization URL with instagram_content_publish scope", () => {
    const url = new URL(buildMetaAuthorizationUrl(config, "state-123"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url.searchParams.get("scope")).toContain("instagram_content_publish");
  });

  it("exchanges an authorization code for a short-lived token", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const parsed = new URL(String(url));
      expect(parsed.pathname).toBe("/v21.0/oauth/access_token");
      expect(parsed.searchParams.get("code")).toBe("code-abc");
      return new Response(JSON.stringify({ access_token: "short-lived", token_type: "bearer", expires_in: 5184000 }), { status: 200 });
    });
    const result = await exchangeMetaAuthorizationCode(config, "code-abc", fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ accessToken: "short-lived", expiresInSec: 5184000 });
  });

  it("exchanges a short-lived token for a long-lived one via fb_exchange_token", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get("grant_type")).toBe("fb_exchange_token");
      expect(parsed.searchParams.get("fb_exchange_token")).toBe("short-lived");
      return new Response(JSON.stringify({ access_token: "long-lived", token_type: "bearer", expires_in: 5184000 }), { status: 200 });
    });
    const result = await exchangeMetaLongLivedToken(config, "short-lived", fetchMock as unknown as typeof fetch);
    expect(result.accessToken).toBe("long-lived");
  });

  it("throws on a Meta-shaped error even with HTTP 200", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 } }), { status: 200 }));
    await expect(exchangeMetaAuthorizationCode(config, "bad-code", fetchMock as unknown as typeof fetch)).rejects.toThrow(/190/);
  });

  it("resolves linked Instagram business accounts from the user's Facebook Pages, filtering out Pages with no linked IG account", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "page-1", name: "Demo Biz", instagram_business_account: { id: "ig-1" } },
            { id: "page-2", name: "No IG Linked" },
          ],
        }),
        { status: 200 },
      ),
    );
    const accounts = await fetchLinkedInstagramAccounts("at-1", fetchMock as unknown as typeof fetch);
    expect(accounts).toEqual([{ pageId: "page-1", pageName: "Demo Biz", instagramBusinessAccountId: "ig-1" }]);
  });

  it("fetches Instagram account info for the health check", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "ig-1", username: "demo_biz" }), { status: 200 }));
    const info = await fetchInstagramAccountInfo("ig-1", "at-1", fetchMock as unknown as typeof fetch);
    expect(info).toEqual({ id: "ig-1", username: "demo_biz" });
  });

  it("throws when the token is invalid — the real signal for reauth_required", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Error validating access token", type: "OAuthException", code: 190 } }), { status: 200 }));
    await expect(fetchInstagramAccountInfo("ig-1", "expired", fetchMock as unknown as typeof fetch)).rejects.toThrow(/190/);
  });
});
