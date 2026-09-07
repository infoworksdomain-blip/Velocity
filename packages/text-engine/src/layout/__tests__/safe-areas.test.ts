import { describe, expect, it } from "vitest";
import { boxForPlatforms, boxHeight, boxWidth, insetsToBox, intersectSafeBoxes, isViableBox, type SafeAreasConfig } from "../safe-areas.js";

const CONFIG: SafeAreasConfig = {
  version: 1,
  frameWidth: 1080,
  frameHeight: 1920,
  platforms: {
    tiktok: { topInset: 180, bottomInset: 500, rightInset: 220, leftInset: 40 },
    reels: { topInset: 160, bottomInset: 400, rightInset: 180, leftInset: 40 },
    shorts: { topInset: 140, bottomInset: 320, rightInset: 180, leftInset: 40 },
  },
};

describe("insetsToBox", () => {
  it("converts insets to absolute frame coordinates", () => {
    const box = insetsToBox(CONFIG.platforms.tiktok!, 1080, 1920);
    expect(box).toEqual({ top: 180, bottom: 1420, left: 40, right: 860 });
  });
});

describe("intersectSafeBoxes", () => {
  it("returns the tightest box across all inputs (widest insets win)", () => {
    const boxes = ["tiktok", "reels", "shorts"].map((p) => insetsToBox(CONFIG.platforms[p]!, 1080, 1920));
    const intersection = intersectSafeBoxes(boxes);
    // TikTok has the largest top/bottom/right insets among the three — the intersection must match TikTok's numbers exactly, since it's the tightest constraint on every edge here.
    expect(intersection).toEqual({ top: 180, bottom: 1420, left: 40, right: 860 });
  });

  it("a single box's intersection is itself", () => {
    const box = insetsToBox(CONFIG.platforms.shorts!, 1080, 1920);
    expect(intersectSafeBoxes([box])).toEqual(box);
  });

  it("throws on an empty list rather than silently returning an unbounded box", () => {
    expect(() => intersectSafeBoxes([])).toThrow();
  });
});

describe("boxForPlatforms", () => {
  it("matches manual insetsToBox + intersectSafeBoxes for the same platform set", () => {
    const viaHelper = boxForPlatforms(CONFIG, ["tiktok", "reels"]);
    const manual = intersectSafeBoxes([insetsToBox(CONFIG.platforms.tiktok!, 1080, 1920), insetsToBox(CONFIG.platforms.reels!, 1080, 1920)]);
    expect(viaHelper).toEqual(manual);
  });

  it("throws for an unconfigured platform rather than silently ignoring it", () => {
    expect(() => boxForPlatforms(CONFIG, ["tiktok", "not_a_real_platform"])).toThrow();
  });
});

describe("boxWidth/boxHeight/isViableBox", () => {
  it("computes width and height from the box edges", () => {
    const box = { top: 100, bottom: 500, left: 50, right: 450 };
    expect(boxWidth(box)).toBe(400);
    expect(boxHeight(box)).toBe(400);
    expect(isViableBox(box)).toBe(true);
  });

  it("an inverted (non-overlapping) box is not viable", () => {
    const box = { top: 500, bottom: 100, left: 50, right: 450 };
    expect(isViableBox(box)).toBe(false);
  });
});
