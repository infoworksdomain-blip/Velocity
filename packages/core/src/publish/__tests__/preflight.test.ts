import { describe, expect, it } from "vitest";
import { runPreflightChecks, type RunPreflightChecksInput } from "../preflight";

const baseInput: RunPreflightChecksInput = {
  platform: "instagram",
  render: { qcPassed: true, aiGenerated: true, durationMs: 20000, outputStorageKey: "renders/r1/output.mp4" },
  contentItem: { approvedByUserId: "user-1", approvedAt: new Date("2026-06-01T00:00:00Z") },
  socialAccount: { connectionStatus: "connected" },
  quota: { allowed: true },
  mediaSpec: { maxDurationMs: 90000, minDurationMs: 3000, aspectRatio: "9:16", note: "" },
  platformPaused: false,
};

describe("runPreflightChecks", () => {
  it("passes when every check is satisfied", () => {
    const result = runPreflightChecks(baseInput);
    expect(result.passed).toBe(true);
    expect(result.failureKind).toBeNull();
    expect(result.reasons).toEqual([]);
  });

  it("fails terminal when QC has not passed", () => {
    const result = runPreflightChecks({ ...baseInput, render: { ...baseInput.render, qcPassed: false } });
    expect(result.passed).toBe(false);
    expect(result.failureKind).toBe("terminal");
    expect(result.reasons.join(" ")).toContain("QC");
  });

  it("fails terminal when QC has never run (null)", () => {
    const result = runPreflightChecks({ ...baseInput, render: { ...baseInput.render, qcPassed: null } });
    expect(result.passed).toBe(false);
    expect(result.failureKind).toBe("terminal");
  });

  it("fails terminal when there is no recorded human approval (C7)", () => {
    const result = runPreflightChecks({ ...baseInput, contentItem: { approvedByUserId: null, approvedAt: null } });
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("approval");
  });

  it("fails terminal when the social account is not connected", () => {
    const result = runPreflightChecks({ ...baseInput, socialAccount: { connectionStatus: "reauth_required" } });
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("reconnect");
  });

  it("fails terminal when duration exceeds the platform's spec (Instagram's 90s Reels cap)", () => {
    const result = runPreflightChecks({ ...baseInput, render: { ...baseInput.render, durationMs: 120000 } });
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("exceeds");
  });

  it("fails terminal when duration is below the platform's minimum", () => {
    const result = runPreflightChecks({ ...baseInput, render: { ...baseInput.render, durationMs: 500 } });
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("below");
  });

  it("fails terminal when the render has no output", () => {
    const result = runPreflightChecks({ ...baseInput, render: { ...baseInput.render, outputStorageKey: null } });
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("no output");
  });

  it("fails with failureKind quota (not terminal) when there is no quota headroom, distinctly from the other checks", () => {
    const result = runPreflightChecks({ ...baseInput, quota: { allowed: false } });
    expect(result.passed).toBe(false);
    expect(result.failureKind).toBe("quota");
  });

  it("fails with failureKind quota (not terminal) when the platform is globally paused (STEP 18 kill switch)", () => {
    const result = runPreflightChecks({ ...baseInput, platformPaused: true });
    expect(result.passed).toBe(false);
    expect(result.failureKind).toBe("quota");
    expect(result.reasons.join(" ")).toContain("paused");
  });

  it("a global pause is checked even when every other check would otherwise pass, before quota is consulted", () => {
    const result = runPreflightChecks({ ...baseInput, platformPaused: true, quota: { allowed: false } });
    expect(result.reasons.join(" ")).toContain("paused");
    expect(result.reasons.join(" ")).not.toContain("headroom");
  });

  it("reports every failing terminal reason at once, not just the first", () => {
    const result = runPreflightChecks({
      ...baseInput,
      render: { ...baseInput.render, qcPassed: false, durationMs: 999999 },
      contentItem: { approvedByUserId: null, approvedAt: null },
    });
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
