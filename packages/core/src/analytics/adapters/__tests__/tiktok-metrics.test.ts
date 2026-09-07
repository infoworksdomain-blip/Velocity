import { describe, expect, it, vi } from "vitest";
import { fetchTikTokVideoMetrics, type TikTokMetricsCredentials } from "../tiktok-metrics";

const credentials: TikTokMetricsCredentials = { accessToken: "at-1" };

describe("TikTok metrics adapter", () => {
  it("returns an empty array without calling fetch for an empty id list", async () => {
    const fetchMock = vi.fn();
    const result = await fetchTikTokVideoMetrics(credentials, [], fetchMock as unknown as typeof fetch);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when given more than 20 video ids (the documented per-call limit)", async () => {
    const fetchMock = vi.fn();
    await expect(fetchTikTokVideoMetrics(credentials, Array.from({ length: 21 }, (_, i) => `v${i}`), fetchMock as unknown as typeof fetch)).rejects.toThrow(/20/);
  });

  it("fetches and maps real documented fields", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("https://open.tiktokapis.com/v2/video/query/");
      const body = JSON.parse(init?.body as string);
      expect(body.filters.video_ids).toEqual(["v1", "v2"]);
      return new Response(
        JSON.stringify({ data: { videos: [{ id: "v1", view_count: 1000, like_count: 50, comment_count: 5, share_count: 2 }, { id: "v2", view_count: 200 }] }, error: { code: "ok", message: "", log_id: "1" } }),
        { status: 200 },
      );
    });
    const result = await fetchTikTokVideoMetrics(credentials, ["v1", "v2"], fetchMock as unknown as typeof fetch);
    expect(result).toEqual([
      { videoId: "v1", views: 1000, likes: 50, comments: 5, shares: 2 },
      { videoId: "v2", views: 200, likes: null, comments: null, shares: null },
    ]);
  });

  it("throws on a TikTok-shaped error even with HTTP 200", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: "access_token_invalid", message: "token expired", log_id: "1" } }), { status: 200 }));
    await expect(fetchTikTokVideoMetrics(credentials, ["v1"], fetchMock as unknown as typeof fetch)).rejects.toThrow(/access_token_invalid/);
  });
});
