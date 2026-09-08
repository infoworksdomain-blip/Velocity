import { describe, expect, it } from "vitest";
import { computeCostPerPublishedPost } from "../cost-metrics";

describe("computeCostPerPublishedPost — STEP 21's literal 'cost per published post' metric", () => {
  it("divides total cost by published post count", () => {
    const result = computeCostPerPublishedPost(12.5, 5);
    expect(result.costPerPostUsd).toBe(2.5);
    expect(result.totalCostUsd).toBe(12.5);
    expect(result.publishedPostCount).toBe(5);
  });

  it("returns null (not 0, not NaN) when there are no published posts yet", () => {
    const result = computeCostPerPublishedPost(0, 0);
    expect(result.costPerPostUsd).toBeNull();
  });

  it("handles a real fractional result without rounding surprises", () => {
    const result = computeCostPerPublishedPost(10, 3);
    expect(result.costPerPostUsd).toBeCloseTo(3.3333, 4);
  });
});
