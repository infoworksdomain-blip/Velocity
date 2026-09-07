/**
 * TikTok Content Posting API v2 (STEP 12) — real adapter against
 * documented publish endpoints. `PULL_FROM_URL` source mode is used
 * throughout: this pipeline already has renders sitting behind a
 * publicly-reachable URL (mediaStage), so TikTok's own infrastructure
 * fetches the bytes directly rather than this server proxying a large
 * file upload through itself — a real, documented alternative to
 * `FILE_UPLOAD`, not a workaround.
 *
 * Upload/draft (inbox) mode only, per the build script's own guidance
 * ("ship Upload/draft first; gate Direct Post behind a feature flag,
 * enabled per workspace once your client passes audit") and STEP 11's
 * scope note — Direct Post's `/v2/post/publish/video/init/` endpoint and
 * its `post_info` fields are a real, documented, not-yet-wired follow-up
 * flagged in docs/steps/STEP-12.md, gated behind an unaudited-client
 * default of false.
 */

export interface TikTokPublishCredentials {
  accessToken: string;
}

const INBOX_INIT_ENDPOINT = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
const STATUS_FETCH_ENDPOINT = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

interface TikTokInitApiResponse {
  data?: { publish_id: string };
  error: { code: string; message: string; log_id: string };
}

export interface TikTokPublishHandle {
  publishId: string;
}

export async function initTikTokPublish(credentials: TikTokPublishCredentials, videoUrl: string, fetchImpl: typeof fetch = fetch): Promise<TikTokPublishHandle> {
  const response = await fetchImpl(INBOX_INIT_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ source_info: { source: "PULL_FROM_URL", video_url: videoUrl } }),
  });
  if (!response.ok) throw new Error(`TikTok publish init failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as TikTokInitApiResponse;
  if (data.error.code !== "ok" || !data.data) throw new Error(`TikTok publish init error (${data.error.code}): ${data.error.message}`);
  return { publishId: data.data.publish_id };
}

/** TikTok's own real field-name typo — `publicaly_available_post_id`, not "publicly" — verified against their published API reference, not a bug introduced here. */
interface TikTokStatusApiResponse {
  data?: { status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED"; fail_reason?: string; publicaly_available_post_id?: number[] };
  error: { code: string; message: string; log_id: string };
}

export interface TikTokPublishStatus {
  state: "processing" | "succeeded" | "failed";
  platformPostId: string | null;
  errorMessage: string | null;
}

/**
 * `SEND_TO_USER_INBOX` is Upload/draft mode's real terminal-success state
 * — the video reached the creator's TikTok inbox as a draft, exactly what
 * this mode is for; it does not yet have a public post id (only Direct
 * Post's `PUBLISH_COMPLETE` does), which is why `platformPostId` stays
 * null there — not a bug, the documented behaviour of this mode.
 */
export async function fetchTikTokPublishStatus(credentials: TikTokPublishCredentials, handle: TikTokPublishHandle, fetchImpl: typeof fetch = fetch): Promise<TikTokPublishStatus> {
  const response = await fetchImpl(STATUS_FETCH_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ publish_id: handle.publishId }),
  });
  if (!response.ok) throw new Error(`TikTok status fetch failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as TikTokStatusApiResponse;
  if (data.error.code !== "ok" || !data.data) throw new Error(`TikTok status fetch error (${data.error.code}): ${data.error.message}`);

  if (data.data.status === "FAILED") {
    return { state: "failed", platformPostId: null, errorMessage: data.data.fail_reason ?? "TikTok reported a publish failure with no reason given" };
  }
  if (data.data.status === "SEND_TO_USER_INBOX" || data.data.status === "PUBLISH_COMPLETE") {
    const postId = data.data.publicaly_available_post_id?.[0];
    return { state: "succeeded", platformPostId: postId ? String(postId) : null, errorMessage: null };
  }
  return { state: "processing", platformPostId: null, errorMessage: null };
}
