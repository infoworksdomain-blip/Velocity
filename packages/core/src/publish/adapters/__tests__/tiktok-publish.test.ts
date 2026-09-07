import { describe, expect, it, vi } from "vitest";
import { fetchTikTokPublishStatus, initTikTokPublish, type TikTokPublishCredentials } from "../tiktok-publish";

const credentials: TikTokPublishCredentials = { accessToken: "at-1" };

describe("TikTok publish adapter", () => {
  it("initiates a PULL_FROM_URL upload to the inbox/draft endpoint", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
      const body = JSON.parse(init?.body as string);
      expect(body.source_info).toEqual({ source: "PULL_FROM_URL", video_url: "https://cdn.example.com/v.mp4" });
      return new Response(JSON.stringify({ data: { publish_id: "v_inbox_file~v2.abc" }, error: { code: "ok", message: "", log_id: "1" } }), { status: 200 });
    });
    const handle = await initTikTokPublish(credentials, "https://cdn.example.com/v.mp4", fetchMock as unknown as typeof fetch);
    expect(handle.publishId).toBe("v_inbox_file~v2.abc");
  });

  it("throws on a TikTok-shaped error even with HTTP 200", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: "invalid_param", message: "video_url unreachable", log_id: "1" } }), { status: 200 }));
    await expect(initTikTokPublish(credentials, "https://bad", fetchMock as unknown as typeof fetch)).rejects.toThrow(/invalid_param/);
  });

  it("reports SEND_TO_USER_INBOX (draft mode's real terminal-success state) with no public post id yet", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok", message: "", log_id: "1" } }), { status: 200 }));
    const status = await fetchTikTokPublishStatus(credentials, { publishId: "p1" }, fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("succeeded");
    expect(status.platformPostId).toBeNull();
  });

  it("reports PUBLISH_COMPLETE with the real (misspelled) publicaly_available_post_id field", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [123456789] }, error: { code: "ok", message: "", log_id: "1" } }), { status: 200 }));
    const status = await fetchTikTokPublishStatus(credentials, { publishId: "p1" }, fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("succeeded");
    expect(status.platformPostId).toBe("123456789");
  });

  it("reports FAILED with the real fail_reason", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { status: "FAILED", fail_reason: "picture_size_check_failed" }, error: { code: "ok", message: "", log_id: "1" } }), { status: 200 }));
    const status = await fetchTikTokPublishStatus(credentials, { publishId: "p1" }, fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("failed");
    expect(status.errorMessage).toBe("picture_size_check_failed");
  });

  it("reports PROCESSING_DOWNLOAD as still processing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { status: "PROCESSING_DOWNLOAD" }, error: { code: "ok", message: "", log_id: "1" } }), { status: 200 }));
    const status = await fetchTikTokPublishStatus(credentials, { publishId: "p1" }, fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("processing");
  });
});
