import { refreshTikTokAccessToken, type TikTokOAuthConfig } from "../auth/oauth/tiktok.js";
import { exchangeMetaLongLivedToken, fetchInstagramAccountInfo, type MetaOAuthConfig } from "../auth/oauth/meta.js";
import { refreshYouTubeAccessToken, fetchYouTubeChannel, type YouTubeOAuthConfig } from "../auth/oauth/youtube.js";
import { fetchTikTokUserInfo } from "../auth/oauth/tiktok.js";

/**
 * Unifies the three platform OAuth adapters behind one shape the
 * token-refresh daemon and account-health check can call generically,
 * without a platform-specific branch at every call site. The real
 * asymmetry between platforms is handled HERE, once, rather than leaking
 * into callers: TikTok/YouTube have genuine refresh_token grants; Meta
 * has none — "refreshing" a Meta token means re-exchanging the CURRENT
 * still-valid long-lived access token for a new one via the same
 * fb_exchange_token call (see meta.ts's own doc comment). Every platform
 * still reports back a `refreshMaterial` string the caller persists and
 * passes to the NEXT refresh call — for TikTok/YouTube that's the real
 * refresh_token; for Meta it's just the new access token itself, which is
 * what that platform's own refresh call actually needs next time.
 */

export type Platform = "tiktok" | "instagram" | "youtube";

export interface PlatformOAuthConfigs {
  tiktok: TikTokOAuthConfig;
  instagram: MetaOAuthConfig;
  youtube: YouTubeOAuthConfig;
}

export interface PlatformRefreshResult {
  accessToken: string;
  refreshMaterial: string;
  expiresInSec: number;
}

export async function refreshPlatformToken(platform: Platform, configs: PlatformOAuthConfigs, refreshMaterial: string, fetchImpl: typeof fetch = fetch): Promise<PlatformRefreshResult> {
  switch (platform) {
    case "tiktok": {
      const result = await refreshTikTokAccessToken(configs.tiktok, refreshMaterial, fetchImpl);
      return { accessToken: result.accessToken, refreshMaterial: result.refreshToken, expiresInSec: result.expiresInSec };
    }
    case "instagram": {
      const result = await exchangeMetaLongLivedToken(configs.instagram, refreshMaterial, fetchImpl);
      return { accessToken: result.accessToken, refreshMaterial: result.accessToken, expiresInSec: result.expiresInSec ?? 5184000 };
    }
    case "youtube": {
      const result = await refreshYouTubeAccessToken(configs.youtube, refreshMaterial, fetchImpl);
      return { accessToken: result.accessToken, refreshMaterial: result.refreshToken ?? refreshMaterial, expiresInSec: result.expiresInSec };
    }
  }
}

export interface PlatformHealthInfo {
  externalAccountId: string;
  displayName: string;
}

/** The generic account-health check every platform's adapter already exposes as a side effect of "fetch account info" — a call that fails (401/expired-token error) IS the reconnect-required signal (GATE 11: "a revoked token yields a clear reconnect prompt, not a silent failure"). `resourceId` is the platform-specific extra identifier Instagram needs (its own IG business account id) that TikTok/YouTube don't. */
export async function checkPlatformAccountHealth(platform: Platform, configs: PlatformOAuthConfigs, accessToken: string, resourceId: string | null, fetchImpl: typeof fetch = fetch): Promise<PlatformHealthInfo> {
  void configs;
  switch (platform) {
    case "tiktok": {
      const info = await fetchTikTokUserInfo(accessToken, fetchImpl);
      return { externalAccountId: info.openId, displayName: info.displayName };
    }
    case "instagram": {
      if (!resourceId) throw new Error("Instagram account health check needs the linked Instagram business account id");
      const info = await fetchInstagramAccountInfo(resourceId, accessToken, fetchImpl);
      return { externalAccountId: info.id, displayName: info.username };
    }
    case "youtube": {
      const info = await fetchYouTubeChannel(accessToken, fetchImpl);
      return { externalAccountId: info.channelId, displayName: info.title };
    }
  }
}
