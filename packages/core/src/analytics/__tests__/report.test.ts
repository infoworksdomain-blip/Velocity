import { describe, expect, it } from "vitest";
import { buildWeeklyReport } from "../report";

describe("buildWeeklyReport", () => {
  it("includes workspace name, period, and every summary section in the report body", () => {
    const email = buildWeeklyReport({
      workspaceName: "Demo Biz",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-07",
      byPlatform: [{ key: "tiktok", count: 3, totalViews: 3000, totalLikes: 300, totalComments: 10, totalShares: 5, avgEngagementRate: 0.1 }],
      byFormat: [{ key: "meme", count: 2, totalViews: 2000, totalLikes: 200, totalComments: 5, totalShares: 2, avgEngagementRate: 0.1 }],
      byHookPattern: [{ key: "curiosity_gap", count: 2, totalViews: 2000, totalLikes: 200, totalComments: 5, totalShares: 2, avgEngagementRate: 0.1 }],
      outliers: [],
    });
    expect(email.subject).toContain("Demo Biz");
    expect(email.subject).toContain("2026-06-01");
    expect(email.text).toContain("Demo Biz");
    expect(email.text).toContain("tiktok");
    expect(email.text).toContain("meme");
    expect(email.text).toContain("curiosity_gap");
    expect(email.text).toContain("No statistical outliers this period.");
  });

  it("lists outliers with their direction and magnitude when present", () => {
    const email = buildWeeklyReport({
      workspaceName: "Demo Biz",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-07",
      byPlatform: [],
      byFormat: [],
      byHookPattern: [],
      outliers: [{ publicationId: "pub-winner", engagementRate: 0.5, zScore: 3.2, direction: "over" }],
    });
    expect(email.text).toContain("Overperformed");
    expect(email.text).toContain("pub-winner");
    expect(email.text).toContain("3.2σ");
  });

  it("sorts each summary section by engagement rate, highest first", () => {
    const email = buildWeeklyReport({
      workspaceName: "Demo Biz",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-07",
      byPlatform: [
        { key: "youtube", count: 1, totalViews: 100, totalLikes: 1, totalComments: 0, totalShares: 0, avgEngagementRate: 0.01 },
        { key: "tiktok", count: 1, totalViews: 100, totalLikes: 20, totalComments: 0, totalShares: 0, avgEngagementRate: 0.2 },
      ],
      byFormat: [],
      byHookPattern: [],
      outliers: [],
    });
    const tiktokIndex = email.text.indexOf("tiktok");
    const youtubeIndex = email.text.indexOf("youtube");
    expect(tiktokIndex).toBeGreaterThan(-1);
    expect(tiktokIndex).toBeLessThan(youtubeIndex);
  });
});
