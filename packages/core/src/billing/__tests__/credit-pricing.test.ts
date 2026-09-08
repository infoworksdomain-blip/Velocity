import { describe, expect, it } from "vitest";
import { creditsForUsage, CREDITS_PER_IMAGE, CREDITS_PER_TEXT_CALL, CREDITS_PER_TTS_CALL, CREDITS_PER_TRANSCRIPTION_CALL, CREDITS_PER_VIDEO_SECOND } from "../credit-pricing";

describe("creditsForUsage — market-anchored pricing (build script: 4/image, 10/sec video)", () => {
  it("prices a 20s video at exactly 200 credits, the build script's own literal example", () => {
    expect(creditsForUsage({ jobKind: "video", durationSec: 20 })).toBe(200);
  });

  it("prices video at CREDITS_PER_VIDEO_SECOND per second, rounded up for fractional seconds", () => {
    expect(creditsForUsage({ jobKind: "video", durationSec: 5 })).toBe(5 * CREDITS_PER_VIDEO_SECOND);
    expect(creditsForUsage({ jobKind: "video", durationSec: 5.1 })).toBe(Math.ceil(5.1 * CREDITS_PER_VIDEO_SECOND));
  });

  it("throws for a video job with no positive duration — a metering bug worth surfacing loudly, not silently charging 0", () => {
    expect(() => creditsForUsage({ jobKind: "video" })).toThrow();
    expect(() => creditsForUsage({ jobKind: "video", durationSec: 0 })).toThrow();
    expect(() => creditsForUsage({ jobKind: "video", durationSec: -1 })).toThrow();
  });

  it("prices an image at a flat CREDITS_PER_IMAGE regardless of any duration passed", () => {
    expect(creditsForUsage({ jobKind: "image" })).toBe(CREDITS_PER_IMAGE);
    expect(creditsForUsage({ jobKind: "image", durationSec: 999 })).toBe(CREDITS_PER_IMAGE);
  });

  it("prices text near-free — the cheapest job kind, per the build script's own explicit reasoning about the swipe-queue economics", () => {
    expect(creditsForUsage({ jobKind: "text" })).toBe(CREDITS_PER_TEXT_CALL);
    expect(CREDITS_PER_TEXT_CALL).toBeLessThan(CREDITS_PER_IMAGE);
    expect(CREDITS_PER_TEXT_CALL).toBeLessThan(CREDITS_PER_VIDEO_SECOND);
  });

  it("prices tts and transcription as flat per-call charges", () => {
    expect(creditsForUsage({ jobKind: "tts" })).toBe(CREDITS_PER_TTS_CALL);
    expect(creditsForUsage({ jobKind: "transcription" })).toBe(CREDITS_PER_TRANSCRIPTION_CALL);
  });
});
