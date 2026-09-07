/**
 * Instagram media insights (STEP 13) — real, documented endpoint:
 * `GET /{ig-media-id}/insights?metric=...`. Reels expose reach, likes,
 * comments, shares and plays as per-media insights; `follows` and
 * `profile_visits` are ACCOUNT-level insights (a different endpoint,
 * `/{ig-user-id}/insights`, not a per-media one) — not fabricated here
 * as if they were per-post numbers.
 */

const GRAPH_API_VERSION = "v21.0";
const METRICS = "reach,likes,comments,shares,plays";

export interface InstagramMetricsCredentials {
  accessToken: string;
}

export interface InstagramMediaMetrics {
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  plays: number | null;
}

interface InstagramInsightsApiResponse {
  data?: { name: string; values: { value: number }[] }[];
  error?: { message: string; type: string; code: number };
}

export async function fetchInstagramMediaInsights(credentials: InstagramMetricsCredentials, mediaId: string, fetchImpl: typeof fetch = fetch): Promise<InstagramMediaMetrics> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}/insights`);
  url.searchParams.set("metric", METRICS);
  url.searchParams.set("access_token", credentials.accessToken);

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Instagram media insights fetch failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as InstagramInsightsApiResponse;
  if (data.error) throw new Error(`Instagram media insights error (${data.error.code} ${data.error.type}): ${data.error.message}`);

  const byName = new Map((data.data ?? []).map((m) => [m.name, m.values[0]?.value ?? null]));
  return {
    reach: byName.get("reach") ?? null,
    likes: byName.get("likes") ?? null,
    comments: byName.get("comments") ?? null,
    shares: byName.get("shares") ?? null,
    plays: byName.get("plays") ?? null,
  };
}
