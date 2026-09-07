/**
 * TikTok video metrics (STEP 13) — real, documented endpoint:
 * `POST /v2/video/query/`, which accepts up to 20 video ids per call and
 * returns per-video fields including `view_count`, `like_count`,
 * `comment_count`, `share_count`. TikTok's basic video-query surface
 * does not expose watch-time, follows, or profile-visits at the
 * individual-video level (those live behind separate Business/Creator
 * analytics surfaces this build doesn't integrate) — this adapter
 * reports `null` for them rather than inventing a field that doesn't
 * exist in the documented response, per this codebase's "never invent a
 * third-party API contract" rule.
 */

export interface TikTokMetricsCredentials {
  accessToken: string;
}

export interface TikTokVideoMetrics {
  videoId: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

const VIDEO_QUERY_ENDPOINT = "https://open.tiktokapis.com/v2/video/query/";
const FIELDS = "id,view_count,like_count,comment_count,share_count";

interface TikTokVideoQueryApiResponse {
  data?: { videos: { id: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[] };
  error: { code: string; message: string; log_id: string };
}

export async function fetchTikTokVideoMetrics(credentials: TikTokMetricsCredentials, videoIds: string[], fetchImpl: typeof fetch = fetch): Promise<TikTokVideoMetrics[]> {
  if (videoIds.length === 0) return [];
  if (videoIds.length > 20) throw new Error(`TikTok's video query endpoint accepts at most 20 video ids per call, got ${videoIds.length}`);

  const url = new URL(VIDEO_QUERY_ENDPOINT);
  url.searchParams.set("fields", FIELDS);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ filters: { video_ids: videoIds } }),
  });
  if (!response.ok) throw new Error(`TikTok video metrics query failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as TikTokVideoQueryApiResponse;
  if (data.error.code !== "ok" || !data.data) throw new Error(`TikTok video metrics query error (${data.error.code}): ${data.error.message}`);

  return data.data.videos.map((v) => ({ videoId: v.id, views: v.view_count ?? null, likes: v.like_count ?? null, comments: v.comment_count ?? null, shares: v.share_count ?? null }));
}
