/**
 * Meta's publishing OAuth for Instagram (STEP 11) — real adapter against
 * Facebook Login for Business + Graph API's documented endpoints. Instagram
 * publishing has no OAuth of its own; it always goes through a Facebook
 * Page's linked Instagram professional account, which is why this module
 * is named `meta`, not `instagram` — the token and the Page/IG-account
 * resolution genuinely are Meta concepts, not Instagram-specific ones.
 */

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

const GRAPH_API_VERSION = "v21.0";
const AUTHORIZATION_ENDPOINT = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`;

/** Business Login scopes for Instagram content publishing + reading the linked Page/IG account. */
const SCOPES = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management";

export function buildMetaAuthorizationUrl(config: MetaOAuthConfig, state: string): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

interface MetaTokenApiResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  error?: { message: string; type: string; code: number };
}

function parseTokenApiResponse(data: MetaTokenApiResponse): { accessToken: string; expiresInSec: number | null } {
  if (data.error) throw new Error(`Meta OAuth error (${data.error.code} ${data.error.type}): ${data.error.message}`);
  return { accessToken: data.access_token, expiresInSec: data.expires_in ?? null };
}

/** The short-lived token from the initial code exchange — Meta ALWAYS requires the follow-up long-lived exchange below before this is usable for anything beyond the immediate request; short-lived tokens expire in ~1-2h. */
export async function exchangeMetaAuthorizationCode(config: MetaOAuthConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<{ accessToken: string; expiresInSec: number | null }> {
  const url = new URL(TOKEN_ENDPOINT);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Meta token exchange failed: ${response.status} ${await response.text()}`);
  return parseTokenApiResponse((await response.json()) as MetaTokenApiResponse);
}

/**
 * The real, documented, easy-to-miss Meta-specific step: exchanges the
 * short-lived token from the code exchange for a long-lived one (~60
 * days). Meta has no separate refresh-token grant like Google/TikTok —
 * "refreshing" a long-lived Meta token means calling this SAME endpoint
 * again with the current (still-valid) long-lived token, which extends it
 * another ~60 days; see refreshMetaLongLivedToken below, which is
 * literally this function under a different name for that reuse.
 */
export async function exchangeMetaLongLivedToken(config: MetaOAuthConfig, shortLivedAccessToken: string, fetchImpl: typeof fetch = fetch): Promise<{ accessToken: string; expiresInSec: number | null }> {
  const url = new URL(TOKEN_ENDPOINT);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedAccessToken);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Meta long-lived token exchange failed: ${response.status} ${await response.text()}`);
  return parseTokenApiResponse((await response.json()) as MetaTokenApiResponse);
}

export const refreshMetaLongLivedToken = exchangeMetaLongLivedToken;

export interface MetaInstagramAccount {
  pageId: string;
  pageName: string;
  instagramBusinessAccountId: string;
}

interface MetaPagesApiResponse {
  data: { id: string; name: string; instagram_business_account?: { id: string } }[];
  error?: { message: string; type: string; code: number };
}

/**
 * Resolves the Instagram professional account(s) linked to the user's
 * Facebook Pages — the real, two-hop lookup Instagram publishing needs
 * (build script: Instagram publishing always targets an `ig-user-id`,
 * which only exists via this Page linkage, never directly from the
 * Instagram OAuth token itself, because there isn't one).
 */
export async function fetchLinkedInstagramAccounts(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<MetaInstagramAccount[]> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts`);
  url.searchParams.set("fields", "id,name,instagram_business_account");
  url.searchParams.set("access_token", accessToken);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Meta pages fetch failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as MetaPagesApiResponse;
  if (data.error) throw new Error(`Meta pages error (${data.error.code} ${data.error.type}): ${data.error.message}`);
  return data.data
    .filter((page): page is typeof page & { instagram_business_account: { id: string } } => Boolean(page.instagram_business_account))
    .map((page) => ({ pageId: page.id, pageName: page.name, instagramBusinessAccountId: page.instagram_business_account.id }));
}

export interface InstagramAccountHealth {
  id: string;
  username: string;
}

/** The account-health check — also the real signal for token validity (an expired/revoked token surfaces as a Graph API error here, exactly like TikTok's user-info call). */
export async function fetchInstagramAccountInfo(instagramBusinessAccountId: string, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<InstagramAccountHealth> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${instagramBusinessAccountId}`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Instagram account info fetch failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { id: string; username: string; error?: { message: string; type: string; code: number } };
  if (data.error) throw new Error(`Instagram account info error (${data.error.code} ${data.error.type}): ${data.error.message}`);
  return { id: data.id, username: data.username };
}
