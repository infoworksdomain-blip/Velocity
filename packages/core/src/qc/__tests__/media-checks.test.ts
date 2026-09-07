import { describe, expect, it } from "vitest";
import { checkAudioPresence, checkDurationAndAspect, type MediaProbe, type TargetSpec } from "../media-checks.js";

const TARGET: TargetSpec = {
  targetWidthPx: 1080,
  targetHeightPx: 1920,
  minDurationMs: 5000,
  maxDurationMs: 60000,
  requiresAudio: true,
};

describe("checkDurationAndAspect", () => {
  it("passes a correctly-sized, correctly-timed probe", () => {
    const probe: MediaProbe = { widthPx: 1080, heightPx: 1920, durationMs: 15000, hasAudioTrack: true };
    expect(checkDurationAndAspect(probe, TARGET)).toEqual({ passed: true, reasons: [] });
  });

  it("fails a wrong aspect ratio", () => {
    const probe: MediaProbe = { widthPx: 1920, heightPx: 1080, durationMs: 15000, hasAudioTrack: true };
    const result = checkDurationAndAspect(probe, TARGET);
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/aspect ratio/);
  });

  it("fails a too-short duration", () => {
    const probe: MediaProbe = { widthPx: 1080, heightPx: 1920, durationMs: 1000, hasAudioTrack: true };
    const result = checkDurationAndAspect(probe, TARGET);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("below minimum"))).toBe(true);
  });

  it("fails a too-long duration", () => {
    const probe: MediaProbe = { widthPx: 1080, heightPx: 1920, durationMs: 120000, hasAudioTrack: true };
    const result = checkDurationAndAspect(probe, TARGET);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("exceeds maximum"))).toBe(true);
  });
});

describe("checkAudioPresence", () => {
  it("passes when audio is required and present", () => {
    const probe: MediaProbe = { widthPx: 1080, heightPx: 1920, durationMs: 15000, hasAudioTrack: true };
    expect(checkAudioPresence(probe, TARGET)).toEqual({ passed: true, reasons: [] });
  });

  it("fails when audio is required but absent", () => {
    const probe: MediaProbe = { widthPx: 1080, heightPx: 1920, durationMs: 15000, hasAudioTrack: false };
    expect(checkAudioPresence(probe, TARGET).passed).toBe(false);
  });

  it("passes when audio is not required, regardless of presence", () => {
    const probe: MediaProbe = { widthPx: 1080, heightPx: 1920, durationMs: 15000, hasAudioTrack: false };
    expect(checkAudioPresence(probe, { ...TARGET, requiresAudio: false }).passed).toBe(true);
  });
});
