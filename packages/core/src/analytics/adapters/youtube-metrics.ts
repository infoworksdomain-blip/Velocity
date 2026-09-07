/**
 * YouTube video statistics (STEP 13) — real, documented endpoint:
 * `GET /youtube/v3/videos?part=statistics`, batching up to 50 video ids
 * per call. Exposes `viewCount`, `likeCount`, `commentCount`. Real
 * watch-time data lives behind the separate YouTube Analytics API
 * (`youtubeAnalytics.reports.query`, a distinct OAuth-scoped surface
 * from the Data API v3 this build already integrates for publishing) —
 * not built here, reported as `null` rather than approximated.
 */

const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

export interface YouTubeMetricsCredentials {
  accessToken: string;
}

export interface YouTubeVideoMetrics {
  videoId: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
}

interface YouTubeVideosListApiResponse {
  items: { id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
  error?: { message: string };
}

export async function fetchYouTubeVideoStatistics(credentials: YouTubeMetricsCredentials, videoIds: string[], fetchImpl: typeof fetch = fetch): Promise<YouTubeVideoMetrics[]> {
  if (videoIds.length === 0) return [];
  if (videoIds.length > 50) throw new Error(`YouTube's videos.list endpoint accepts at most 50 video ids per call, got ${videoIds.length}`);

  const url = new URL(VIDEOS_ENDPOINT);
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", videoIds.join(","));
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
  if (!response.ok) throw new Error(`YouTube video statistics fetch failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as YouTubeVideosListApiResponse;
  if (data.error) throw new Error(`YouTube video statistics error: ${data.error.message}`);

  return data.items.map((item) => ({
    videoId: item.id,
    views: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
    likes: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null,
    comments: item.statistics?.commentCount ? Number(item.statistics.commentCount) : null,
  }));
}
