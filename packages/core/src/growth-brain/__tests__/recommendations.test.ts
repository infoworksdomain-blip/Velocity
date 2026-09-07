import { describe, expect, it } from "vitest";
import { generateRecommendations, rankRecommendationsAcrossDimensions } from "../recommendations";
import type { GroupSummary } from "../../analytics/aggregate";

function group(overrides: Partial<GroupSummary>): GroupSummary {
  return { key: "x", count: 5, totalViews: 1000, totalLikes: 50, totalComments: 5, totalShares: 5, avgEngagementRate: 0.05, ...overrides };
}

describe("generateRecommendations", () => {
  it("returns nothing with fewer than 2 qualifying groups", () => {
    expect(generateRecommendations([group({ key: "curiosity_gap", count: 5 })], "hook pattern")).toEqual([]);
  });

  it("returns nothing when groups don't meet the minimum sample size", () => {
    const groups = [group({ key: "curiosity_gap", count: 1, avgEngagementRate: 0.2 }), group({ key: "contrarian", count: 1, avgEngagementRate: 0.05 })];
    expect(generateRecommendations(groups, "hook pattern", 3)).toEqual([]);
  });

  it("returns nothing when the ratio between best and worst is below the noteworthy threshold", () => {
    const groups = [group({ key: "a", avgEngagementRate: 0.052 }), group({ key: "b", avgEngagementRate: 0.05 })];
    expect(generateRecommendations(groups, "format")).toEqual([]);
  });

  /** The build script's own literal example, reproduced with real numbers: "curiosity-gap hooks outperform contrarian 2.4x on your account." */
  it("finds a real ratio-based winner/loser and cites the exact GroupSummary data behind it", () => {
    const winner = group({ key: "curiosity_gap", count: 12, avgEngagementRate: 0.12 });
    const loser = group({ key: "contrarian", count: 8, avgEngagementRate: 0.05 });
    const recs = generateRecommendations([winner, loser], "hook pattern");

    expect(recs).toHaveLength(1);
    expect(recs[0]!.winnerKey).toBe("curiosity_gap");
    expect(recs[0]!.loserKey).toBe("contrarian");
    expect(recs[0]!.ratio).toBeCloseTo(2.4, 1);
    expect(recs[0]!.finding).toContain("curiosity_gap");
    expect(recs[0]!.finding).toContain("2.4x");
    // GATE 14: the recommendation cites the actual data, not just prose.
    expect(recs[0]!.citedMetrics.winner).toEqual(winner);
    expect(recs[0]!.citedMetrics.loser).toEqual(loser);
  });

  it("ignores a group with zero engagement (division-by-zero-adjacent edge, not a real winner or loser)", () => {
    const groups = [group({ key: "a", avgEngagementRate: 0.1 }), group({ key: "b", avgEngagementRate: 0 }), group({ key: "c", avgEngagementRate: 0.03 })];
    const recs = generateRecommendations(groups, "format");
    expect(recs).toHaveLength(1);
    expect(recs[0]!.loserKey).toBe("c"); // "b" is excluded entirely (zero engagement), so the real loser among qualifying groups is "c", not "b"
  });
});

describe("rankRecommendationsAcrossDimensions", () => {
  it("ranks findings across multiple dimensions by ratio, strongest first", () => {
    const byDimension = {
      format: [group({ key: "meme", avgEngagementRate: 0.06 }), group({ key: "slideshow", avgEngagementRate: 0.05 })], // ~1.2x
      hookPattern: [group({ key: "curiosity_gap", avgEngagementRate: 0.2 }), group({ key: "contrarian", avgEngagementRate: 0.05 })], // 4x
    };
    const ranked = rankRecommendationsAcrossDimensions(byDimension);
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked[0]!.dimensionLabel).toBe("hookPattern");
  });
});
