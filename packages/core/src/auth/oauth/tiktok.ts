/**
 * TikTok's publishing OAuth (STEP 11) — a real adapter against TikTok's
 * publicly documented Login Kit v2 / Content Posting API endpoints, the
 * same "implementing a documented contract, not inventing one" (rule 5)
 * discipline as google.ts. Distinct from any future consumer sign-in flow
 * — this is scoped for `video.publish`/`video.upload`, not identity.
 */

export interface TikTokOAuthConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TikTokTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  refreshExpiresInSec: number;
  openId: string;
  scope: string;
}

const AUTHORIZATION_ENDPOINT = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_ENDPOINT = "https://open.tiktokapis.com/v2/user/info/";

/** `video.publish`/`video.upload` for the Content Posting API, `user.info.basic` for the account-health check — the minimum scope set STEP 11 actually uses; a real app registration may request more. */
const SCOPES = "user.info.basic,video.publish,video.upload";

export function buildTikTokAuthorizationUrl(config: TikTokOAuthConfig, state: string): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_key", config.clientKey);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

interface TikTokTokenApiResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

function parseTokenResponse(data: TikTokTokenApiResponse): TikTokTokenResponse {
  if (data.error) {
    throw new Error(`TikTok OAuth error: ${data.error} — ${data.error_description ?? "no description"}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSec: data.expires_in,
    refreshExpiresInSec: data.refresh_expires_in,
    openId: data.open_id,
    scope: data.scope,
  };
}

export async function exchangeTikTokAuthorizationCode(config: TikTokOAuthConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<TikTokTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  });
  if (!response.ok) throw new Error(`TikTok token exchange failed: ${response.status} ${await response.text()}`);
  return parseTokenResponse((await response.json()) as TikTokTokenApiResponse);
}

/** TikTok's refresh tokens are themselves rotated on every refresh — the caller MUST persist the new refreshToken, not just the new accessToken (a real, easy-to-miss TikTok-specific detail; Google's/Meta's refresh tokens are typically long-lived and unchanged across a refresh). */
export async function refreshTikTokAccessToken(config: TikTokOAuthConfig, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<TikTokTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error(`TikTok token refresh failed: ${response.status} ${await response.text()}`);
  return parseTokenResponse((await response.json()) as TikTokTokenApiResponse);
}

export interface TikTokUserInfo {
  openId: string;
  displayName: string;
  isPrivate: boolean;
}

/** The account-health check (STEP 11's "per-account health") — also the real signal for whether a token is still valid at all (a 401/invalid-token error here is exactly what routers/social.ts's health check reacts to by setting connection_status = reauth_required). */
export async function fetchTikTokUserInfo(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<TikTokUserInfo> {
  const url = new URL(USER_INFO_ENDPOINT);
  url.searchParams.set("fields", "open_id,display_name,is_verified");
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`TikTok user info fetch failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { data: { user: { open_id: string; display_name: string } }; error: { code: string; message: string } };
  if (data.error && data.error.code !== "ok") throw new Error(`TikTok user info error: ${data.error.code} — ${data.error.message}`);
  return { openId: data.data.user.open_id, displayName: data.data.user.display_name, isPrivate: false };
}
