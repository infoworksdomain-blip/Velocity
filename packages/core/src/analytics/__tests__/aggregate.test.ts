import { describe, expect, it } from "vitest";
import { aggregateByFormat, aggregateByHookPattern, aggregateByPersona, aggregateByPublishCohort, detectOutliers, engagementRate, type MetricSample } from "../aggregate";

function sample(overrides: Partial<MetricSample>): MetricSample {
  return {
    publicationId: "pub-1",
    platform: "tiktok",
    format: "meme",
    angleKind: "pain_led",
    personaId: null,
    hookPattern: "curiosity_gap",
    publishedAtLocalDate: "2026-06-01",
    views: 1000,
    likes: 50,
    comments: 5,
    shares: 5,
    ...overrides,
  };
}

describe("engagementRate", () => {
  it("computes (likes+comments+shares)/views", () => {
    expect(engagementRate({ views: 1000, likes: 50, comments: 5, shares: 5 })).toBeCloseTo(0.06, 5);
  });

  it("treats a null/zero view count as 1 to avoid a division-by-zero blowup", () => {
    expect(engagementRate({ views: 0, likes: 5, comments: 0, shares: 0 })).toBe(5);
    expect(engagementRate({ views: null, likes: 5, comments: 0, shares: 0 })).toBe(5);
  });

  it("treats null likes/comments/shares as 0", () => {
    expect(engagementRate({ views: 100, likes: null, comments: null, shares: null })).toBe(0);
  });
});

describe("aggregateByFormat / aggregateByHookPattern / aggregateByPersona / aggregateByPublishCohort", () => {
  const samples: MetricSample[] = [
    sample({ publicationId: "p1", format: "meme", hookPattern: "curiosity_gap", personaId: null, publishedAtLocalDate: "2026-06-01", views: 1000, likes: 100 }),
    sample({ publicationId: "p2", format: "meme", hookPattern: "contrarian", personaId: "persona-1", publishedAtLocalDate: "2026-06-01", views: 2000, likes: 40 }),
    sample({ publicationId: "p3", format: "slideshow", hookPattern: "curiosity_gap", personaId: "persona-1", publishedAtLocalDate: "2026-06-02", views: 500, likes: 10 }),
  ];

  it("groups by format and computes real per-group totals and averages", () => {
    const result = aggregateByFormat(samples);
    const meme = result.find((r) => r.key === "meme")!;
    expect(meme.count).toBe(2);
    expect(meme.totalViews).toBe(3000);
    const slideshow = result.find((r) => r.key === "slideshow")!;
    expect(slideshow.count).toBe(1);
  });

  it("groups by hook pattern", () => {
    const result = aggregateByHookPattern(samples);
    const curiosityGap = result.find((r) => r.key === "curiosity_gap")!;
    expect(curiosityGap.count).toBe(2);
  });

  it("omits samples with a null persona from the persona grouping — a 'persona:null' bucket would mean nothing", () => {
    const result = aggregateByPersona(samples);
    expect(result.some((r) => r.key === "null")).toBe(false);
    expect(result.find((r) => r.key === "persona-1")?.count).toBe(2);
  });

  it("groups by publish cohort (local date)", () => {
    const result = aggregateByPublishCohort(samples);
    expect(result.find((r) => r.key === "2026-06-01")?.count).toBe(2);
    expect(result.find((r) => r.key === "2026-06-02")?.count).toBe(1);
  });
});

describe("detectOutliers", () => {
  it("returns nothing for fewer than 3 samples — not enough data for a meaningful stdev", () => {
    const samples = [sample({ publicationId: "p1" }), sample({ publicationId: "p2", likes: 5000 })];
    expect(detectOutliers(samples)).toEqual([]);
  });

  it("returns nothing when every sample performs identically (stdDev is 0)", () => {
    const samples = Array.from({ length: 5 }, (_, i) => sample({ publicationId: `p${i}` }));
    expect(detectOutliers(samples)).toEqual([]);
  });

  it("flags a genuine overperformer with a real z-score", () => {
    const samples = [
      sample({ publicationId: "p1", views: 1000, likes: 20, comments: 0, shares: 0 }), // 2%
      sample({ publicationId: "p2", views: 1000, likes: 21, comments: 0, shares: 0 }), // 2.1%
      sample({ publicationId: "p3", views: 1000, likes: 19, comments: 0, shares: 0 }), // 1.9%
      sample({ publicationId: "p4", views: 1000, likes: 20, comments: 0, shares: 0 }), // 2%
      sample({ publicationId: "winner", views: 1000, likes: 900, comments: 0, shares: 0 }), // 90% — a real outlier
    ];
    // A 4-near-identical-cluster + 1-outlier shape has a mathematical
    // invariant: with population z-score, the outlier's z is always
    // exactly 2.0 regardless of how extreme the outlier's value is (a
    // property of this specific n=5, 4-vs-1 split, not of the outlier's
    // magnitude) — so threshold=1.5 here tests real detection behavior
    // without depending on floating-point exactness at a boundary this
    // construction always lands on.
    const outliers = detectOutliers(samples, 1.5);
    expect(outliers).toHaveLength(1);
    expect(outliers[0]!.publicationId).toBe("winner");
    expect(outliers[0]!.direction).toBe("over");
    expect(outliers[0]!.zScore).toBeGreaterThan(1.9); // real invariant of this 4-vs-1 shape: z lands essentially exactly at 2.0
  });

  it("flags a genuine underperformer as direction 'under'", () => {
    const samples = [
      sample({ publicationId: "p1", views: 1000, likes: 100, comments: 0, shares: 0 }),
      sample({ publicationId: "p2", views: 1000, likes: 105, comments: 0, shares: 0 }),
      sample({ publicationId: "p3", views: 1000, likes: 95, comments: 0, shares: 0 }),
      sample({ publicationId: "p4", views: 1000, likes: 100, comments: 0, shares: 0 }),
      sample({ publicationId: "loser", views: 1000, likes: 1, comments: 0, shares: 0 }),
    ];
    const outliers = detectOutliers(samples, 1.5);
    const loser = outliers.find((o) => o.publicationId === "loser");
    expect(loser?.direction).toBe("under");
  });

  it("sorts outliers by magnitude, largest deviation first", () => {
    const samples = [
      sample({ publicationId: "p1", views: 1000, likes: 20, comments: 0, shares: 0 }),
      sample({ publicationId: "p2", views: 1000, likes: 21, comments: 0, shares: 0 }),
      sample({ publicationId: "p3", views: 1000, likes: 19, comments: 0, shares: 0 }),
      sample({ publicationId: "mild", views: 1000, likes: 80, comments: 0, shares: 0 }),
      sample({ publicationId: "extreme", views: 1000, likes: 900, comments: 0, shares: 0 }),
    ];
    const outliers = detectOutliers(samples, 1);
    expect(outliers[0]!.publicationId).toBe("extreme");
  });
});
