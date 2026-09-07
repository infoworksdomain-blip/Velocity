import { describe, expect, it } from "vitest";
import { detectPublicFigureReference, PublicFiguresConfigSchema, type PublicFiguresConfig } from "../public-figure-check";

const CONFIG: PublicFiguresConfig = { version: 1, names: ["Elon Musk", "Taylor Swift"], note: "test fixture" };

describe("detectPublicFigureReference", () => {
  it("matches a public figure's name case-insensitively", () => {
    expect(detectPublicFigureReference("make a video starring elon musk", CONFIG)).toEqual({ matched: true, matchedName: "Elon Musk" });
  });

  it("matches regardless of surrounding text", () => {
    const result = detectPublicFigureReference("Our new UGC video features Taylor Swift promoting the product.", CONFIG);
    expect(result.matched).toBe(true);
    expect(result.matchedName).toBe("Taylor Swift");
  });

  it("does not match when no configured name appears", () => {
    expect(detectPublicFigureReference("a generic UGC script about morning routines", CONFIG)).toEqual({ matched: false, matchedName: null });
  });

  it("does not false-positive on a substring inside an unrelated word", () => {
    expect(detectPublicFigureReference("the elonmuskfanclub.com website", CONFIG).matched).toBe(false);
  });

  it("does not treat special regex characters in a name as regex syntax (escaped correctly)", () => {
    const config: PublicFiguresConfig = { version: 1, names: ["A.J. Styles"], note: "test" };
    expect(detectPublicFigureReference("a video with a.j. styles", config).matched).toBe(true);
    expect(detectPublicFigureReference("a video with aj styles", config).matched).toBe(false);
  });
});

describe("PublicFiguresConfigSchema", () => {
  it("validates the real config/public-figures.json file", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = fileURLToPath(new URL("../../../../../config/public-figures.json", import.meta.url));
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    expect(() => PublicFiguresConfigSchema.parse(raw)).not.toThrow();
  });
});
