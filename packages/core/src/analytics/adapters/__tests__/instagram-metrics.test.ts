import { describe, expect, it, vi } from "vitest";
import { fetchInstagramMediaInsights, type InstagramMetricsCredentials } from "../instagram-metrics";

const credentials: InstagramMetricsCredentials = { accessToken: "at-1" };

describe("Instagram metrics adapter", () => {
  it("fetches and maps real documented per-media insight metrics", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe("/v21.0/media-1/insights");
      expect(u.searchParams.get("metric")).toBe("reach,likes,comments,shares,plays");
      return new Response(
        JSON.stringify({ data: [{ name: "reach", values: [{ value: 500 }] }, { name: "likes", values: [{ value: 40 }] }, { name: "plays", values: [{ value: 600 }] }] }),
        { status: 200 },
      );
    });
    const result = await fetchInstagramMediaInsights(credentials, "media-1", fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ reach: 500, likes: 40, comments: null, shares: null, plays: 600 });
  });

  it("throws on a Graph API error payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Unsupported get request", type: "GraphMethodException", code: 100 } }), { status: 200 }));
    await expect(fetchInstagramMediaInsights(credentials, "media-1", fetchMock as unknown as typeof fetch)).rejects.toThrow(/Unsupported get request/);
  });
});
