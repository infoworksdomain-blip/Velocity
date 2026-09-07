import { describe, expect, it, vi } from "vitest";
import { createInstagramContainer, fetchInstagramContainerStatus, publishInstagramContainer, type InstagramPublishCredentials } from "../instagram-publish";

const credentials: InstagramPublishCredentials = { accessToken: "at-1", instagramBusinessAccountId: "ig-user-1" };

describe("Instagram publish adapter", () => {
  it("creates a REELS container with is_ai_generated set for C2 self-disclosure", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe("/v21.0/ig-user-1/media");
      expect(u.searchParams.get("media_type")).toBe("REELS");
      expect(u.searchParams.get("video_url")).toBe("https://cdn.example.com/v.mp4");
      expect(u.searchParams.get("is_ai_generated")).toBe("true");
      return new Response(JSON.stringify({ id: "container-1" }), { status: 200 });
    });
    const handle = await createInstagramContainer(credentials, "https://cdn.example.com/v.mp4", "caption text", true, fetchMock as unknown as typeof fetch);
    expect(handle.containerId).toBe("container-1");
  });

  it("throws on a Graph API error payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid video_url", type: "OAuthException", code: 100 } }), { status: 200 }));
    await expect(createInstagramContainer(credentials, "https://bad", "cap", true, fetchMock as unknown as typeof fetch)).rejects.toThrow(/Invalid video_url/);
  });

  it("reports FINISHED as succeeded", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(new URL(String(url)).searchParams.get("fields")).toBe("status_code");
      return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
    });
    const status = await fetchInstagramContainerStatus(credentials, { containerId: "container-1" }, fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("succeeded");
  });

  it("reports ERROR/EXPIRED as failed", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status_code: "ERROR" }), { status: 200 }));
    const status = await fetchInstagramContainerStatus(credentials, { containerId: "container-1" }, fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("failed");
  });

  it("reports IN_PROGRESS as still processing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status_code: "IN_PROGRESS" }), { status: 200 }));
    const status = await fetchInstagramContainerStatus(credentials, { containerId: "container-1" }, fetchMock as unknown as typeof fetch);
    expect(status.state).toBe("processing");
  });

  it("publishes a finished container via creation_id and returns the real media id", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe("/v21.0/ig-user-1/media_publish");
      expect(u.searchParams.get("creation_id")).toBe("container-1");
      return new Response(JSON.stringify({ id: "17920238422030506" }), { status: 200 });
    });
    const result = await publishInstagramContainer(credentials, { containerId: "container-1" }, fetchMock as unknown as typeof fetch);
    expect(result.mediaId).toBe("17920238422030506");
  });
});
