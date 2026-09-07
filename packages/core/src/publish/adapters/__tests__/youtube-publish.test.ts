import { describe, expect, it, vi } from "vitest";
import { fetchYouTubeVideoStatus, initYouTubeResumableSession, uploadYouTubeVideo, type YouTubePublishCredentials } from "../youtube-publish";

const credentials: YouTubePublishCredentials = { accessToken: "at-1" };

describe("YouTube publish adapter", () => {
  it("creates a resumable session with containsSyntheticMedia set (C2) and reads the Location header", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("uploadType=resumable");
      const body = JSON.parse(init?.body as string);
      expect(body.status.containsSyntheticMedia).toBe(true);
      expect(body.status.selfDeclaredMadeForKids).toBe(false);
      return new Response(null, { status: 200, headers: { Location: "https://upload.googleapis.com/session/abc" } });
    });
    const session = await initYouTubeResumableSession(credentials, { title: "t", description: "d", containsSyntheticMedia: true }, "video/mp4", fetchMock as unknown as typeof fetch);
    expect(session.uploadUrl).toBe("https://upload.googleapis.com/session/abc");
  });

  it("throws when the session response has no Location header", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    await expect(initYouTubeResumableSession(credentials, { title: "t", description: "d", containsSyntheticMedia: true }, "video/mp4", fetchMock as unknown as typeof fetch)).rejects.toThrow(/Location/);
  });

  it("PUTs the video bytes and returns the created video id", async () => {
    const bytes = Buffer.from("fake-video-bytes");
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://upload.googleapis.com/session/abc");
      expect(init?.method).toBe("PUT");
      expect(init?.body).toBe(bytes);
      return new Response(JSON.stringify({ id: "video-1", status: { uploadStatus: "uploaded" } }), { status: 200 });
    });
    const result = await uploadYouTubeVideo({ uploadUrl: "https://upload.googleapis.com/session/abc" }, bytes, "video/mp4", fetchMock as unknown as typeof fetch);
    expect(result.videoId).toBe("video-1");
  });

  it("reports uploaded/processed as succeeded", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [{ id: "video-1", status: { uploadStatus: "processed" } }] }), { status: 200 }));
    const status = await fetchYouTubeVideoStatus(credentials, "video-1", fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("succeeded");
  });

  it("reports failed/rejected as failed with the real reason", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [{ id: "video-1", status: { uploadStatus: "rejected", rejectionReason: "copyright" } }] }), { status: 200 }));
    const status = await fetchYouTubeVideoStatus(credentials, "video-1", fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("failed");
    expect(status.errorMessage).toBe("copyright");
  });

  it("treats a not-yet-indexed video (no items) as still processing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const status = await fetchYouTubeVideoStatus(credentials, "video-1", fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("processing");
  });
});
