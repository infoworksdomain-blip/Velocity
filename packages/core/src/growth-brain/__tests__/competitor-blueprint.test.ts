import { describe, expect, it, vi } from "vitest";
import { buildTrendSignalFromObservedPost, buildTrendSignalFromYouTubeVideo, fetchYouTubePublicChannelVideos } from "../competitor-blueprint";

describe("fetchYouTubePublicChannelVideos", () => {
  it("calls the real documented search.list endpoint with channelId, type=video, and an API key — no OAuth", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe("https://www.googleapis.com/youtube/v3/search");
      expect(u.searchParams.get("key")).toBe("test-api-key");
      expect(u.searchParams.get("channelId")).toBe("UC_test_channel");
      expect(u.searchParams.get("type")).toBe("video");
      expect(u.searchParams.get("order")).toBe("date");
      return new Response(
        JSON.stringify({ items: [{ id: { videoId: "v1" }, snippet: { title: "How we grew", description: "desc", publishedAt: "2026-06-01T00:00:00Z" } }] }),
        { status: 200 },
      );
    });
    const videos = await fetchYouTubePublicChannelVideos("test-api-key", "UC_test_channel", 10, fetchMock as unknown as typeof fetch);
    expect(videos).toEqual([{ videoId: "v1", title: "How we grew", description: "desc", publishedAt: "2026-06-01T00:00:00Z" }]);
  });

  it("throws on a Data API error payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [], error: { message: "channelId not found" } }), { status: 200 }));
    await expect(fetchYouTubePublicChannelVideos("key", "bad-channel", 10, fetchMock as unknown as typeof fetch)).rejects.toThrow(/channelId not found/);
  });
});

describe("buildTrendSignalFromYouTubeVideo", () => {
  it("builds a real, C3-compliant TrendSignal with no media URL field anywhere in it", () => {
    const signal = buildTrendSignalFromYouTubeVideo({ videoId: "v1", title: "t", description: "d", publishedAt: "2026-06-01T00:00:00Z" }, "productivity");
    expect(signal.niche).toBe("productivity");
    expect(signal.captionText).toContain("t");
    expect(signal.sourceRef).toBe("youtube:v1");
    expect(Object.keys(signal)).not.toContain("videoUrl");
    expect(Object.keys(signal)).not.toContain("url");
  });
});

describe("buildTrendSignalFromObservedPost", () => {
  it("normalizes a manually observed competitor post into the same TrendSignal shape", () => {
    const signal = buildTrendSignalFromObservedPost({ captionText: "Why nobody talks about this", postedAt: "2026-06-01T00:00:00Z", niche: "fitness", views: 10000, likes: 500, comments: 20, shares: 10, observedRef: "tiktok-competitor-post-1" });
    expect(signal.engagement).toEqual({ views: 10000, likes: 500, comments: 20, shares: 10 });
    expect(signal.sourceRef).toBe("observed:tiktok-competitor-post-1");
  });

  it("defaults missing engagement counts to zero rather than throwing", () => {
    const signal = buildTrendSignalFromObservedPost({ captionText: "c", postedAt: "2026-06-01T00:00:00Z", niche: "n", observedRef: "ref-1" });
    expect(signal.engagement).toEqual({ views: 0, likes: 0, comments: 0, shares: 0 });
  });
});
