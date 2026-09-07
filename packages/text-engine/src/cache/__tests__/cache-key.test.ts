import { describe, expect, it } from "vitest";
import { computeTextPlanCacheKey } from "../cache-key.js";

const BASE = { brandProfileVersion: 3, angleId: "angle-1", format: "meme", blueprintId: "bp-1", platform: "tiktok" };

describe("computeTextPlanCacheKey", () => {
  it("is deterministic for identical input", () => {
    expect(computeTextPlanCacheKey(BASE)).toBe(computeTextPlanCacheKey({ ...BASE }));
  });

  it("changes when brandProfileVersion changes — a new brand extraction invalidates the cache", () => {
    expect(computeTextPlanCacheKey(BASE)).not.toBe(computeTextPlanCacheKey({ ...BASE, brandProfileVersion: 4 }));
  });

  it("changes when angleId, format, or platform changes", () => {
    const base = computeTextPlanCacheKey(BASE);
    expect(computeTextPlanCacheKey({ ...BASE, angleId: "angle-2" })).not.toBe(base);
    expect(computeTextPlanCacheKey({ ...BASE, format: "slideshow" })).not.toBe(base);
    expect(computeTextPlanCacheKey({ ...BASE, platform: "reels" })).not.toBe(base);
  });

  it("a null blueprintId participates in the hash as a real value, not as a silently dropped field", () => {
    const withNull = computeTextPlanCacheKey({ ...BASE, blueprintId: null });
    const withOther = computeTextPlanCacheKey({ ...BASE, blueprintId: "bp-2" });
    expect(withNull).not.toBe(BASE.blueprintId);
    expect(withNull).not.toBe(withOther);
    expect(computeTextPlanCacheKey({ ...BASE, blueprintId: null })).toBe(withNull);
  });

  it("produces a hex sha256 digest", () => {
    expect(computeTextPlanCacheKey(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });
});
