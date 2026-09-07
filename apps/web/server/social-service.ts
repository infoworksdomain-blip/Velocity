import { randomUUID } from "node:crypto";
import { auth, calendar, social } from "@velocity/core";
import { createKmsProvider, schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import { getAdminDb } from "./db";

type Platform = social.Platform;
type PlatformOAuthConfigs = social.PlatformOAuthConfigs;

const { loadPlatformCapsConfig, capFor } = calendar;

/** Same CWD-relative-path-with-env-override pattern as config/providers.json (STEP 8), config/safe-areas.json (STEP 8B), and how routers/calendar.ts already reads this same file (STEP 10). */
function platformCapsConfigPath(): string {
  return process.env.VELOCITY_PLATFORM_CAPS_CONFIG ?? "config/platform-caps.json";
}

// OAuth authorization-url builders + code/token exchanges live in @velocity/core's `auth` namespace (packages/core/src/auth/oauth/*) — the same home STEP 3's Google sign-in adapter already uses. Account-health checks + OAuth state signing live in `social` (STEP 11's own new module).
const { buildTikTokAuthorizationUrl, buildYouTubeAuthorizationUrl, buildMetaAuthorizationUrl, exchangeTikTokAuthorizationCode, exchangeYouTubeAuthorizationCode, exchangeMetaAuthorizationCode, exchangeMetaLongLivedToken, fetchLinkedInstagramAccounts } = auth;
const { checkPlatformAccountHealth, issueOAuthState, verifyOAuthState } = social;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — STEP 11's OAuth flows need real app credentials configured`);
  return value;
}

export function loadPlatformOAuthConfigs(): PlatformOAuthConfigs {
  return {
    tiktok: { clientKey: requireEnv("TIKTOK_CLIENT_KEY"), clientSecret: requireEnv("TIKTOK_CLIENT_SECRET"), redirectUri: `${requireEnv("NEXT_PUBLIC_API_URL").replace(/\/api\/v1$/, "")}/api/oauth/tiktok/callback` },
    instagram: { appId: requireEnv("META_APP_ID"), appSecret: requireEnv("META_APP_SECRET"), redirectUri: `${requireEnv("NEXT_PUBLIC_API_URL").replace(/\/api\/v1$/, "")}/api/oauth/instagram/callback` },
    youtube: { clientId: requireEnv("GOOGLE_CLIENT_ID"), clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"), redirectUri: `${requireEnv("NEXT_PUBLIC_API_URL").replace(/\/api\/v1$/, "")}/api/oauth/youtube/callback` },
  };
}

function oauthStateSecret(): string {
  return requireEnv("JWT_ACCESS_SECRET");
}

export async function buildAuthorizationUrl(platform: Platform, workspaceId: string, userId: string): Promise<string> {
  const configs = loadPlatformOAuthConfigs();
  const state = await issueOAuthState({ workspaceId, userId, platform }, oauthStateSecret());
  switch (platform) {
    case "tiktok":
      return buildTikTokAuthorizationUrl(configs.tiktok, state);
    case "instagram":
      return buildMetaAuthorizationUrl(configs.instagram, state);
    case "youtube":
      return buildYouTubeAuthorizationUrl(configs.youtube, state);
  }
}

export interface CompleteConnectionResult {
  workspaceId: string;
  socialAccountId: string;
}

/**
 * The full "exchange code -> resolve account -> encrypt+store token ->
 * upsert social_accounts" sequence — called by the real Next.js route
 * handlers under app/api/oauth/[platform]/callback (browser redirects,
 * not tRPC, since the platform itself redirects the user's browser here
 * with ?code=&state=). `state` is verified BEFORE anything else runs —
 * an invalid/expired/tampered state aborts immediately (rule: never trust
 * unverified redirect input).
 */
export async function completeOAuthConnection(platform: Platform, code: string, stateToken: string): Promise<CompleteConnectionResult> {
  const state = await verifyOAuthState(stateToken, oauthStateSecret());
  if (state.platform !== platform) throw new Error("OAuth state platform mismatch");

  const configs = loadPlatformOAuthConfigs();
  const db = getAdminDb();
  const kms = createKmsProvider();

  let accessToken: string;
  let refreshMaterial: string;
  let expiresInSec: number;
  let externalAccountId: string;
  let handle: string;
  let resourceId: string | null = null;

  if (platform === "tiktok") {
    const tokens = await exchangeTikTokAuthorizationCode(configs.tiktok, code);
    accessToken = tokens.accessToken;
    refreshMaterial = tokens.refreshToken;
    expiresInSec = tokens.expiresInSec;
    const info = await checkPlatformAccountHealth("tiktok", configs, accessToken, null);
    externalAccountId = info.externalAccountId;
    handle = info.displayName;
  } else if (platform === "instagram") {
    const shortLived = await exchangeMetaAuthorizationCode(configs.instagram, code);
    const longLived = await exchangeMetaLongLivedToken(configs.instagram, shortLived.accessToken);
    accessToken = longLived.accessToken;
    refreshMaterial = longLived.accessToken; // Meta has no separate refresh token — see platform-oauth.ts's own doc comment
    expiresInSec = longLived.expiresInSec ?? 5184000;
    const linked = await fetchLinkedInstagramAccounts(accessToken);
    const account = linked[0];
    if (!account) throw new Error("No Instagram professional account is linked to any Facebook Page this user manages");
    resourceId = account.instagramBusinessAccountId;
    const info = await checkPlatformAccountHealth("instagram", configs, accessToken, resourceId);
    externalAccountId = info.externalAccountId;
    handle = info.displayName;
  } else {
    const tokens = await exchangeYouTubeAuthorizationCode(configs.youtube, code);
    accessToken = tokens.accessToken;
    refreshMaterial = tokens.refreshToken ?? "";
    if (!refreshMaterial) throw new Error("Google did not return a refresh_token — the authorization request must include access_type=offline and prompt=consent");
    expiresInSec = tokens.expiresInSec;
    const info = await checkPlatformAccountHealth("youtube", configs, accessToken, null);
    externalAccountId = info.externalAccountId;
    handle = info.displayName;
  }

  const existingRows = await db.select().from(schema.socialAccounts).where(and(eq(schema.socialAccounts.platform, platform), eq(schema.socialAccounts.externalAccountId, externalAccountId))).limit(1);
  const existing = existingRows[0];
  const socialAccountId = existing?.id ?? randomUUID();

  if (existing) {
    await db.update(schema.socialAccounts).set({ handle, connectionStatus: "connected", lastHealthCheckAt: new Date(), workspaceId: state.workspaceId }).where(eq(schema.socialAccounts.id, existing.id));
  } else {
    await db.insert(schema.socialAccounts).values({ id: socialAccountId, workspaceId: state.workspaceId, platform, externalAccountId, handle, connectionStatus: "connected", lastHealthCheckAt: new Date() });
  }

  const { ciphertext, keyId } = await kms.encrypt(JSON.stringify({ accessToken, refreshMaterial, resourceId }));
  const expiresAt = new Date(Date.now() + expiresInSec * 1000);
  const existingCredRows = await db.select({ id: schema.platformCredentials.id }).from(schema.platformCredentials).where(eq(schema.platformCredentials.socialAccountId, socialAccountId)).limit(1);
  if (existingCredRows[0]) {
    await db.update(schema.platformCredentials).set({ encryptedPayload: ciphertext, kmsKeyId: keyId, expiresAt }).where(eq(schema.platformCredentials.id, existingCredRows[0].id));
  } else {
    await db.insert(schema.platformCredentials).values({ id: randomUUID(), workspaceId: state.workspaceId, socialAccountId, encryptedPayload: ciphertext, kmsKeyId: keyId, expiresAt });
  }

  const capsConfig = loadPlatformCapsConfig(platformCapsConfigPath());
  const cap = capFor(capsConfig, platform);
  const existingQuotaRows = await db.select({ id: schema.platformQuotaState.id }).from(schema.platformQuotaState).where(eq(schema.platformQuotaState.socialAccountId, socialAccountId)).limit(1);
  if (!existingQuotaRows[0]) {
    await db.insert(schema.platformQuotaState).values({ id: randomUUID(), workspaceId: state.workspaceId, socialAccountId, windowStartsAt: new Date(), windowSeconds: cap.windowHours * 3600, requestCount: 0, requestCap: cap.postsPerRollingWindow });
  }

  return { workspaceId: state.workspaceId, socialAccountId };
}
