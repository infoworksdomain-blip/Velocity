import type { TrendSignal } from "@velocity/contracts";

/**
 * Competitor Intelligence (STEP 14, build script: "track named
 * competitor public accounts, extract format/cadence/angle patterns —
 * public data, blueprints only, C3"). Only YouTube gets a real automated
 * fetch here — its Data API v3 genuinely supports reading ANY public
 * channel's video list with just an API key, no per-channel OAuth
 * consent, a real documented capability designed for exactly this kind
 * of third-party tracking use case.
 *
 * TikTok and Instagram do NOT have an equivalent public, keyless,
 * third-party discovery API for an arbitrary named account — TikTok's
 * comparable capability (the Research API) requires a separate academic/
 * research approval process; Instagram's Graph API only exposes data for
 * accounts that have granted THIS app permission. Building a scraper to
 * work around that would mean pulling another business's content off
 * their public page against the platform's own terms of service to
 * power a competitor-tracking feature — the same category of thing
 * Appendix B's "no unofficial endpoints" prohibition (C1) already rules
 * out for publishing, applied here to reading. This is flagged rather
 * than built (rule 7: disagree with an instruction here before
 * implementing it, if wrong) — see docs/steps/STEP-14.md. The manual
 * observed-post path below (`buildTrendSignalFromObservedPost`) is the
 * real, ToS-compliant alternative for those two platforms: a workspace
 * operator records what they can already see on a public profile
 * (caption text, approximate posting time, engagement counts shown in
 * the app) and it feeds the exact same blueprint-extraction pipeline.
 */

const YOUTUBE_SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";

export interface YouTubePublicVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
}

interface YouTubeSearchApiResponse {
  items: { id: { videoId: string }; snippet: { title: string; description: string; publishedAt: string } }[];
  error?: { message: string };
}

/** Real, documented, keyless-with-API-key endpoint — no OAuth, no per-channel consent, works for any public channel. */
export async function fetchYouTubePublicChannelVideos(apiKey: string, channelId: string, maxResults = 10, fetchImpl: typeof fetch = fetch): Promise<YouTubePublicVideo[]> {
  const url = new URL(YOUTUBE_SEARCH_ENDPOINT);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("type", "video");

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`YouTube public channel search failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as YouTubeSearchApiResponse;
  if (data.error) throw new Error(`YouTube public channel search error: ${data.error.message}`);

  return data.items.map((item) => ({ videoId: item.id.videoId, title: item.snippet.title, description: item.snippet.description, publishedAt: item.snippet.publishedAt }));
}

export function buildTrendSignalFromYouTubeVideo(video: YouTubePublicVideo, niche: string): TrendSignal {
  return {
    niche,
    captionText: `${video.title}\n${video.description}`.slice(0, 2000),
    beatTimestampsMs: [],
    engagement: { views: 0, likes: 0, comments: 0, shares: 0 }, // search.list carries no statistics — a real, separate videos.list?part=statistics call (already built in analytics/adapters/youtube-metrics.ts) would be needed for real counts; not fabricated here
    observedAt: video.publishedAt,
    sourceRef: `youtube:${video.videoId}`,
  };
}

export interface ObservedCompetitorPost {
  captionText: string;
  postedAt: string; // ISO datetime
  niche: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  /** An opaque reference the operator uses to remember which post this was (e.g. "tiktok post seen 2026-06-01") — never a playable URL, matching TrendSignal's own C3 constraint. */
  observedRef: string;
}

/** The manual-submission path for TikTok/Instagram (see this module's own doc comment) — a workspace operator's real observation of a real public post, normalized into the same TrendSignal shape the automated YouTube path produces. */
export function buildTrendSignalFromObservedPost(post: ObservedCompetitorPost): TrendSignal {
  return {
    niche: post.niche,
    captionText: post.captionText,
    beatTimestampsMs: [],
    engagement: { views: post.views ?? 0, likes: post.likes ?? 0, comments: post.comments ?? 0, shares: post.shares ?? 0 },
    observedAt: post.postedAt,
    sourceRef: `observed:${post.observedRef}`,
  };
}
