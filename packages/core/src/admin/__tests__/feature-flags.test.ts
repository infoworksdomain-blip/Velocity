import { describe, expect, it } from "vitest";
import { type FeatureFlagRow, isPlatformPaused, platformPauseFlagKey, resolveFeatureFlag } from "../feature-flags";

const WORKSPACE_A = "11111111-1111-1111-1111-111111111111";
const WORKSPACE_B = "22222222-2222-2222-2222-222222222222";
const USER_A = "33333333-3333-3333-3333-333333333333";
const USER_B = "44444444-4444-4444-4444-444444444444";

describe("resolveFeatureFlag", () => {
  it("falls closed when no row matches the key at any tier", () => {
    expect(resolveFeatureFlag("nonexistent", [], { workspaceId: WORKSPACE_A, userId: USER_A })).toBe(false);
  });

  it("uses the platform-default (global) row when no more specific row exists", () => {
    const rows: FeatureFlagRow[] = [{ workspaceId: null, userId: null, key: "new_ui", isEnabled: true }];
    expect(resolveFeatureFlag("new_ui", rows, { workspaceId: WORKSPACE_A, userId: USER_A })).toBe(true);
  });

  it("a workspace-scoped row overrides the global default", () => {
    const rows: FeatureFlagRow[] = [
      { workspaceId: null, userId: null, key: "new_ui", isEnabled: true },
      { workspaceId: WORKSPACE_A, userId: null, key: "new_ui", isEnabled: false },
    ];
    expect(resolveFeatureFlag("new_ui", rows, { workspaceId: WORKSPACE_A, userId: USER_A })).toBe(false);
    // A different workspace still sees the global default.
    expect(resolveFeatureFlag("new_ui", rows, { workspaceId: WORKSPACE_B, userId: USER_A })).toBe(true);
  });

  it("a user-scoped row (cross-workspace) overrides the workspace default", () => {
    const rows: FeatureFlagRow[] = [
      { workspaceId: WORKSPACE_A, userId: null, key: "beta_feature", isEnabled: false },
      { workspaceId: null, userId: USER_A, key: "beta_feature", isEnabled: true },
    ];
    expect(resolveFeatureFlag("beta_feature", rows, { workspaceId: WORKSPACE_A, userId: USER_A })).toBe(true);
    // A different user in the same workspace still sees the workspace default.
    expect(resolveFeatureFlag("beta_feature", rows, { workspaceId: WORKSPACE_A, userId: USER_B })).toBe(false);
  });

  it("an exact workspace+user row wins over every other tier", () => {
    const rows: FeatureFlagRow[] = [
      { workspaceId: null, userId: null, key: "beta_feature", isEnabled: false },
      { workspaceId: WORKSPACE_A, userId: null, key: "beta_feature", isEnabled: false },
      { workspaceId: null, userId: USER_A, key: "beta_feature", isEnabled: false },
      { workspaceId: WORKSPACE_A, userId: USER_A, key: "beta_feature", isEnabled: true },
    ];
    expect(resolveFeatureFlag("beta_feature", rows, { workspaceId: WORKSPACE_A, userId: USER_A })).toBe(true);
  });

  it("only matches rows for the requested key, never a different key", () => {
    const rows: FeatureFlagRow[] = [{ workspaceId: null, userId: null, key: "other_flag", isEnabled: true }];
    expect(resolveFeatureFlag("new_ui", rows, { workspaceId: WORKSPACE_A, userId: USER_A })).toBe(false);
  });

  it("with no context at all, only the global row can answer", () => {
    const rows: FeatureFlagRow[] = [
      { workspaceId: WORKSPACE_A, userId: null, key: "new_ui", isEnabled: true },
      { workspaceId: null, userId: null, key: "new_ui", isEnabled: true },
    ];
    expect(resolveFeatureFlag("new_ui", rows, {})).toBe(true);
  });
});

describe("platform pause (global publish kill switch, reusing feature flags)", () => {
  it("builds a deterministic convention key per platform", () => {
    expect(platformPauseFlagKey("tiktok")).toBe("platform_pause:tiktok");
    expect(platformPauseFlagKey("instagram")).toBe("platform_pause:instagram");
  });

  it("is paused only when the global row for that platform's key is enabled", () => {
    const rows: FeatureFlagRow[] = [{ workspaceId: null, userId: null, key: "platform_pause:tiktok", isEnabled: true }];
    expect(isPlatformPaused("tiktok", rows)).toBe(true);
    expect(isPlatformPaused("instagram", rows)).toBe(false);
  });

  it("a workspace-scoped row can never satisfy a platform pause check (no context is passed)", () => {
    const rows: FeatureFlagRow[] = [{ workspaceId: WORKSPACE_A, userId: null, key: "platform_pause:tiktok", isEnabled: true }];
    expect(isPlatformPaused("tiktok", rows)).toBe(false);
  });
});
