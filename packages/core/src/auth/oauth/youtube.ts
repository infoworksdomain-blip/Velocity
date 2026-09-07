/**
 * YouTube's publishing OAuth (STEP 11) — real adapter against Google's
 * same OAuth2 endpoints google.ts already uses, but a genuinely separate
 * module: google.ts is STEP 3's sign-in flow (`openid email profile`
 * scope, no refresh concerns beyond session auth); this is
 * `youtube.upload` scope, a different app registration in practice (a
 * publishing app needs YouTube API access + quota, sign-in doesn't), and
 * carries a real refresh-token grant this flow actually depends on
 * long-term (sign-in tokens are typically short-lived-per-session; a
 * publishing integration must keep working for months). Kept distinct
 * per google.ts's own doc comment.
 */

export interface YouTubeOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface YouTubeTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInSec: number;
  scope: string;
}

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";

const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

export function buildYouTubeAuthorizationUrl(config: YouTubeOAuthConfig, state: string): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline"); // required to get a refresh_token at all
  url.searchParams.set("prompt", "consent"); // forces refresh_token on every consent, not just the first — otherwise a reconnect after revocation gets no refresh_token back
  return url.toString();
}

interface GoogleTokenApiResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

function parseTokenResponse(data: GoogleTokenApiResponse): YouTubeTokenResponse {
  if (data.error) throw new Error(`YouTube OAuth error: ${data.error} — ${data.error_description ?? "no description"}`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresInSec: data.expires_in, scope: data.scope };
}

export async function exchangeYouTubeAuthorizationCode(config: YouTubeOAuthConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<YouTubeTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  });
  if (!response.ok) throw new Error(`YouTube token exchange failed: ${response.status} ${await response.text()}`);
  return parseTokenResponse((await response.json()) as GoogleTokenApiResponse);
}

/** Google's refresh grant does NOT return a new refresh_token (unlike TikTok's) — the original refresh_token stays valid and must be kept, not replaced. */
export async function refreshYouTubeAccessToken(config: YouTubeOAuthConfig, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<YouTubeTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error(`YouTube token refresh failed: ${response.status} ${await response.text()}`);
  const parsed = parseTokenResponse((await response.json()) as GoogleTokenApiResponse);
  return { ...parsed, refreshToken: parsed.refreshToken ?? refreshToken };
}

export interface YouTubeChannelHealth {
  channelId: string;
  title: string;
}

/** The account-health check — `channels.list?mine=true`, 1 quota unit, the cheapest real authenticated call this API offers (matching the build script's own "design to the 100 calls/day at 1 unit bucket" framing — a health check shouldn't itself be what exhausts the quota it's protecting). */
export async function fetchYouTubeChannel(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<YouTubeChannelHealth> {
  const url = new URL(CHANNELS_ENDPOINT);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`YouTube channel fetch failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { items: { id: string; snippet: { title: string } }[] };
  const channel = data.items[0];
  if (!channel) throw new Error("YouTube channel fetch returned no channel for this token");
  return { channelId: channel.id, title: channel.snippet.title };
}
