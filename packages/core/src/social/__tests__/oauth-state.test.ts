import { describe, expect, it } from "vitest";
import { issueOAuthState, verifyOAuthState } from "../oauth-state.js";

const SECRET = "test-secret-at-least-32-chars-long!!";

describe("OAuth state signing", () => {
  it("round-trips a real payload", async () => {
    const token = await issueOAuthState({ workspaceId: "ws-1", userId: "user-1", platform: "tiktok" }, SECRET);
    const verified = await verifyOAuthState(token, SECRET);
    expect(verified.workspaceId).toBe("ws-1");
    expect(verified.userId).toBe("user-1");
    expect(verified.platform).toBe("tiktok");
  });

  it("rejects a state signed with a different secret — the actual CSRF/tamper defense", async () => {
    const token = await issueOAuthState({ workspaceId: "ws-1", userId: "user-1", platform: "instagram" }, SECRET);
    await expect(verifyOAuthState(token, "a-completely-different-secret-value")).rejects.toThrow();
  });

  it("rejects a malformed token outright", async () => {
    await expect(verifyOAuthState("not-a-real-jwt", SECRET)).rejects.toThrow();
  });
});
