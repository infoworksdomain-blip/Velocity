/**
 * YouTube Data API v3 resumable upload (STEP 12) — real, documented
 * two-phase protocol: POST for a session URI (`uploadType=resumable`),
 * then PUT the video bytes to that URI. `status.containsSyntheticMedia`
 * is set at session-creation time — a real, documented property (added
 * 2024-10-30 per the API's revision history) for declaring altered or
 * synthetic content (C2); `status.selfDeclaredMadeForKids` is set to
 * `false` unconditionally since this product's content is business/SME
 * marketing material, never children's content.
 *
 * This adapter does a single-shot PUT of the whole file rather than real
 * chunked byte-range resumability (multiple PUTs with `Content-Range`,
 * resuming from a `308 Resume Incomplete` response's reported offset) —
 * a real, separate protocol feature this step doesn't implement; flagged
 * in docs/steps/STEP-12.md. The control flow (session creation, one PUT,
 * status poll) is real and is what's tested.
 */

const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

export interface YouTubePublishCredentials {
  accessToken: string;
}

export interface YouTubeUploadMeta {
  title: string;
  description: string;
  containsSyntheticMedia: boolean;
}

export interface YouTubeUploadSession {
  uploadUrl: string;
}

export async function initYouTubeResumableSession(credentials: YouTubePublishCredentials, meta: YouTubeUploadMeta, contentType: string, fetchImpl: typeof fetch = fetch): Promise<YouTubeUploadSession> {
  const response = await fetchImpl(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
    },
    body: JSON.stringify({
      snippet: { title: meta.title, description: meta.description },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: meta.containsSyntheticMedia },
    }),
  });
  if (!response.ok) throw new Error(`YouTube resumable session create failed: ${response.status} ${await response.text()}`);
  const uploadUrl = response.headers.get("Location");
  if (!uploadUrl) throw new Error("YouTube resumable session response had no Location header");
  return { uploadUrl };
}

interface YouTubeVideoApiResource {
  id: string;
  status?: { uploadStatus: "uploaded" | "processed" | "failed" | "rejected" | "deleted"; failureReason?: string; rejectionReason?: string };
  error?: { message: string; errors: { reason: string; message: string }[] };
}

export interface YouTubeUploadResult {
  videoId: string;
}

export async function uploadYouTubeVideo(session: YouTubeUploadSession, videoBytes: Uint8Array, contentType: string, fetchImpl: typeof fetch = fetch): Promise<YouTubeUploadResult> {
  const response = await fetchImpl(session.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(videoBytes.byteLength) },
    body: videoBytes as unknown as BodyInit,
  });
  if (!response.ok) throw new Error(`YouTube video upload failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as YouTubeVideoApiResource;
  if (data.error) throw new Error(`YouTube video upload error: ${data.error.message}`);
  return { videoId: data.id };
}

export interface YouTubeVideoStatus {
  state: "processing" | "succeeded" | "failed";
  errorMessage: string | null;
}

export async function fetchYouTubeVideoStatus(credentials: YouTubePublishCredentials, videoId: string, fetchImpl: typeof fetch = fetch): Promise<YouTubeVideoStatus> {
  const url = new URL(VIDEOS_ENDPOINT);
  url.searchParams.set("part", "status");
  url.searchParams.set("id", videoId);
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
  if (!response.ok) throw new Error(`YouTube video status fetch failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { items: YouTubeVideoApiResource[]; error?: { message: string } };
  if (data.error) throw new Error(`YouTube video status error: ${data.error.message}`);
  const item = data.items[0];
  if (!item?.status) return { state: "processing", errorMessage: null };

  if (item.status.uploadStatus === "failed" || item.status.uploadStatus === "rejected") {
    return { state: "failed", errorMessage: item.status.failureReason ?? item.status.rejectionReason ?? "YouTube reported an upload failure" };
  }
  if (item.status.uploadStatus === "uploaded" || item.status.uploadStatus === "processed") {
    return { state: "succeeded", errorMessage: null };
  }
  return { state: "processing", errorMessage: null };
}
