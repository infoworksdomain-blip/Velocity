import { describe, expect, it } from "vitest";
import { bestTimesFor, computeWorkspaceBestTimes, type HistoricalPublishOutcome } from "../best-time";

function outcome(overrides: Partial<HistoricalPublishOutcome>): HistoricalPublishOutcome {
  return { platform: "tiktok", localDate: "2026-06-01", localHour: 9, engagementRate: 0.05, ...overrides };
}

describe("bestTimesFor", () => {
  it("returns the general heuristic for a known platform", () => {
    expect(bestTimesFor("tiktok").length).toBeGreaterThan(0);
  });

  it("falls back to a single generic slot for an unknown platform", () => {
    expect(bestTimesFor("not_a_real_platform")).toEqual(["12:00"]);
  });
});

describe("computeWorkspaceBestTimes", () => {
  it("returns null (not a fabricated ranking) when fewer than the minimum distinct days of data exist", () => {
    const history = Array.from({ length: 10 }, (_, i) => outcome({ localDate: `2026-06-${String(i + 1).padStart(2, "0")}`, localHour: 9 }));
    expect(computeWorkspaceBestTimes(history, "tiktok")).toBeNull();
  });

  it("returns null when the platform has enough days overall but not enough for THIS platform specifically", () => {
    const tiktokHistory = Array.from({ length: 5 }, (_, i) => outcome({ platform: "tiktok", localDate: `day-${i}` }));
    const instagramHistory = Array.from({ length: 40 }, (_, i) => outcome({ platform: "instagram", localDate: `day-${i}` }));
    expect(computeWorkspaceBestTimes([...tiktokHistory, ...instagramHistory], "tiktok")).toBeNull();
  });

  it("ranks real hours by mean engagement once the minimum distinct-day threshold is met, honoring a custom threshold", () => {
    // 35 distinct days: hour 9 always performs well, hour 20 always performs poorly.
    const history: HistoricalPublishOutcome[] = [];
    for (let day = 1; day <= 35; day++) {
      const localDate = `day-${day}`;
      history.push(outcome({ localDate, localHour: 9, engagementRate: 0.20 }));
      history.push(outcome({ localDate, localHour: 20, engagementRate: 0.01 }));
    }
    const result = computeWorkspaceBestTimes(history, "tiktok", 30, 1);
    expect(result).toEqual(["09:00"]);
  });

  it("only considers history for the requested platform", () => {
    const history: HistoricalPublishOutcome[] = [];
    for (let day = 1; day <= 30; day++) {
      const localDate = `2026-06-${String(day).padStart(2, "0")}`;
      history.push(outcome({ platform: "tiktok", localDate, localHour: 9, engagementRate: 0.5 }));
      history.push(outcome({ platform: "instagram", localDate, localHour: 20, engagementRate: 0.9 }));
    }
    const result = computeWorkspaceBestTimes(history, "tiktok", 30, 1);
    expect(result).toEqual(["09:00"]);
  });
});
