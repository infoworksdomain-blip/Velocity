import { describe, expect, it } from "vitest";
import { chooseTextTreatment, contrastRatio, meanLuminance, MIN_CONTRAST_RATIO, type PixelBox } from "../legibility.js";

function solidColorBox(r: number, g: number, b: number, width = 4, height = 4): PixelBox {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

describe("meanLuminance", () => {
  it("pure black has luminance 0", () => {
    expect(meanLuminance(solidColorBox(0, 0, 0))).toBeCloseTo(0, 5);
  });

  it("pure white has luminance 1", () => {
    expect(meanLuminance(solidColorBox(255, 255, 255))).toBeCloseTo(1, 5);
  });

  it("averages across mixed pixels, not just the first one", () => {
    const data = new Uint8ClampedArray(2 * 1 * 4);
    data.set([0, 0, 0, 255], 0); // black
    data.set([255, 255, 255, 255], 4); // white
    const box: PixelBox = { width: 2, height: 1, data };
    const mean = meanLuminance(box);
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(1);
  });

  it("throws for an empty box rather than dividing by zero silently", () => {
    expect(() => meanLuminance({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toThrow();
  });
});

describe("contrastRatio", () => {
  it("black vs white is the maximum possible ratio (21:1)", () => {
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 0);
  });

  it("is symmetric in its two arguments", () => {
    expect(contrastRatio(0.2, 0.8)).toBeCloseTo(contrastRatio(0.8, 0.2), 10);
  });

  it("identical luminances give a ratio of exactly 1", () => {
    expect(contrastRatio(0.5, 0.5)).toBeCloseTo(1, 10);
  });
});

describe("chooseTextTreatment", () => {
  it("picks light-text-on-dark-stroke for a dark frame, and it meets the minimum contrast", () => {
    const { treatment, meetsMinimum, contrastRatioAchieved } = chooseTextTreatment(0.02);
    expect(treatment).toBe("light_text_dark_stroke");
    expect(contrastRatioAchieved).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
    expect(meetsMinimum).toBe(true);
  });

  it("picks dark-text-on-light-plate for a bright frame, and it meets the minimum contrast", () => {
    const { treatment, meetsMinimum } = chooseTextTreatment(0.9);
    expect(treatment).toBe("dark_text_light_plate");
    expect(meetsMinimum).toBe(true);
  });

  it("measures contrast rather than assuming it — a mid-luminance frame right at the threshold still gets checked", () => {
    const result = chooseTextTreatment(0.18);
    expect(result.contrastRatioAchieved).toBeGreaterThan(1);
    expect(typeof result.meetsMinimum).toBe("boolean");
  });
});
