import { describe, expect, it, vi } from "vitest";
import { fetchYouTubeVideoStatistics, type YouTubeMetricsCredentials } from "../youtube-metrics";

const credentials: YouTubeMetricsCredentials = { accessToken: "at-1" };

describe("YouTube metrics adapter", () => {
  it("returns an empty array without calling fetch for an empty id list", async () => {
    const fetchMock = vi.fn();
    const result = await fetchYouTubeVideoStatistics(credentials, [], fetchMock as unknown as typeof fetch);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when given more than 50 video ids (the documented per-call limit)", async () => {
    const fetchMock = vi.fn();
    await expect(fetchYouTubeVideoStatistics(credentials, Array.from({ length: 51 }, (_, i) => `v${i}`), fetchMock as unknown as typeof fetch)).rejects.toThrow(/50/);
  });

  it("fetches and maps real documented statistics fields, parsing string counts to numbers", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      expect(u.searchParams.get("part")).toBe("statistics");
      expect(u.searchParams.get("id")).toBe("v1,v2");
      return new Response(JSON.stringify({ items: [{ id: "v1", statistics: { viewCount: "1000", likeCount: "50", commentCount: "5" } }, { id: "v2", statistics: {} }] }), { status: 200 });
    });
    const result = await fetchYouTubeVideoStatistics(credentials, ["v1", "v2"], fetchMock as unknown as typeof fetch);
    expect(result).toEqual([
      { videoId: "v1", views: 1000, likes: 50, comments: 5 },
      { videoId: "v2", views: null, likes: null, comments: null },
    ]);
  });

  it("throws on a Data API error payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [], error: { message: "API key not valid" } }), { status: 200 }));
    await expect(fetchYouTubeVideoStatistics(credentials, ["v1"], fetchMock as unknown as typeof fetch)).rejects.toThrow(/API key not valid/);
  });
});
