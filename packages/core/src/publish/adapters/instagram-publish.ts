/**
 * Instagram Graph API content publishing (STEP 12) — real, documented
 * three-step container flow: create a container (`POST /{ig-user-id}/
 * media`) → poll its `status_code` until `FINISHED` → publish it (`POST
 * /{ig-user-id}/media_publish`). `is_ai_generated: true` on container
 * creation self-discloses AI-generated media so Instagram applies its own
 * AI info label (C2) — a real, documented Graph API parameter, not
 * modelled from TikTok's inference-only approach (see this module's own
 * docs/steps/STEP-12.md scope note on why TikTok's AI-labelling path is
 * different).
 */

const GRAPH_API_VERSION = "v21.0";

export interface InstagramPublishCredentials {
  accessToken: string;
  instagramBusinessAccountId: string;
}

interface InstagramApiError {
  message: string;
  type: string;
  code: number;
}

interface InstagramContainerApiResponse {
  id: string;
  error?: InstagramApiError;
}

export interface InstagramContainerHandle {
  containerId: string;
}

export async function createInstagramContainer(credentials: InstagramPublishCredentials, videoUrl: string, caption: string, aiGenerated: boolean, fetchImpl: typeof fetch = fetch): Promise<InstagramContainerHandle> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.instagramBusinessAccountId}/media`);
  url.searchParams.set("media_type", "REELS");
  url.searchParams.set("video_url", videoUrl);
  url.searchParams.set("caption", caption);
  url.searchParams.set("is_ai_generated", String(aiGenerated));
  url.searchParams.set("access_token", credentials.accessToken);

  const response = await fetchImpl(url, { method: "POST" });
  if (!response.ok) throw new Error(`Instagram container create failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as InstagramContainerApiResponse;
  if (data.error) throw new Error(`Instagram container create error (${data.error.code} ${data.error.type}): ${data.error.message}`);
  return { containerId: data.id };
}

interface InstagramContainerStatusApiResponse {
  status_code: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";
  error?: InstagramApiError;
}

export interface InstagramContainerStatus {
  state: "processing" | "succeeded" | "failed";
  errorMessage: string | null;
}

export async function fetchInstagramContainerStatus(credentials: InstagramPublishCredentials, handle: InstagramContainerHandle, fetchImpl: typeof fetch = fetch): Promise<InstagramContainerStatus> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${handle.containerId}`);
  url.searchParams.set("fields", "status_code");
  url.searchParams.set("access_token", credentials.accessToken);

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Instagram container status fetch failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as InstagramContainerStatusApiResponse;
  if (data.error) throw new Error(`Instagram container status error (${data.error.code} ${data.error.type}): ${data.error.message}`);

  if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
    return { state: "failed", errorMessage: `Instagram container reached status ${data.status_code}` };
  }
  if (data.status_code === "FINISHED" || data.status_code === "PUBLISHED") {
    return { state: "succeeded", errorMessage: null };
  }
  return { state: "processing", errorMessage: null };
}

interface InstagramPublishApiResponse {
  id: string;
  error?: InstagramApiError;
}

/** The actual publish call — a container reaching FINISHED has NOT yet posted anything; this is the step that makes it live, distinct from TikTok/YouTube where the poll's terminal state already implies the post exists. */
export async function publishInstagramContainer(credentials: InstagramPublishCredentials, handle: InstagramContainerHandle, fetchImpl: typeof fetch = fetch): Promise<{ mediaId: string }> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.instagramBusinessAccountId}/media_publish`);
  url.searchParams.set("creation_id", handle.containerId);
  url.searchParams.set("access_token", credentials.accessToken);

  const response = await fetchImpl(url, { method: "POST" });
  if (!response.ok) throw new Error(`Instagram media_publish failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as InstagramPublishApiResponse;
  if (data.error) throw new Error(`Instagram media_publish error (${data.error.code} ${data.error.type}): ${data.error.message}`);
  return { mediaId: data.id };
}
