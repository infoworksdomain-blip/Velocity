import { describe, expect, it } from "vitest";
import {
  evaluateCompetitorPostTrigger,
  evaluateLowQueueTrigger,
  evaluateNewBlueprintInNicheTrigger,
  evaluatePerformanceThresholdTrigger,
  evaluateProductFeedChangeTrigger,
  evaluateScheduleTrigger,
} from "../triggers";

describe("evaluateScheduleTrigger", () => {
  it("fires when now is within the firing window and hasn't fired yet today", () => {
    const result = evaluateScheduleTrigger({ timeOfDay: "09:00" }, { nowInWorkspaceTimezone: { hour: 9, minute: 2, dayOfWeek: 1 }, lastFiredAt: null });
    expect(result.fired).toBe(true);
  });

  it("does not fire outside the firing window", () => {
    const result = evaluateScheduleTrigger({ timeOfDay: "09:00" }, { nowInWorkspaceTimezone: { hour: 14, minute: 0, dayOfWeek: 1 }, lastFiredAt: null });
    expect(result.fired).toBe(false);
  });

  it("does not fire twice within the same window", () => {
    const result = evaluateScheduleTrigger({ timeOfDay: "09:00" }, { nowInWorkspaceTimezone: { hour: 9, minute: 2, dayOfWeek: 1 }, lastFiredAt: new Date() });
    expect(result.fired).toBe(false);
    expect(result.reason).toContain("Already fired");
  });

  it("respects daysOfWeek restriction", () => {
    const result = evaluateScheduleTrigger({ timeOfDay: "09:00", daysOfWeek: [1, 2, 3, 4, 5] }, { nowInWorkspaceTimezone: { hour: 9, minute: 2, dayOfWeek: 0 }, lastFiredAt: null });
    expect(result.fired).toBe(false);
    expect(result.reason).toContain("not in the configured daysOfWeek");
  });

  it("rejects a malformed timeOfDay rather than silently misfiring", () => {
    const result = evaluateScheduleTrigger({ timeOfDay: "not-a-time" }, { nowInWorkspaceTimezone: { hour: 9, minute: 0, dayOfWeek: 1 }, lastFiredAt: null });
    expect(result.fired).toBe(false);
    expect(result.reason).toContain("Invalid timeOfDay");
  });
});

describe("evaluatePerformanceThresholdTrigger", () => {
  it("fires when a group breaches a 'below' threshold", () => {
    const result = evaluatePerformanceThresholdTrigger(
      { dimension: "hookPattern", metric: "avgEngagementRate", comparator: "below", threshold: 0.05 },
      { groups: [{ key: "curiosity_gap", avgEngagementRate: 0.02 }] },
    );
    expect(result.fired).toBe(true);
  });

  it("does not fire when no group breaches the threshold", () => {
    const result = evaluatePerformanceThresholdTrigger(
      { dimension: "hookPattern", metric: "avgEngagementRate", comparator: "below", threshold: 0.01 },
      { groups: [{ key: "curiosity_gap", avgEngagementRate: 0.05 }] },
    );
    expect(result.fired).toBe(false);
  });

  it("fires when a group breaches an 'above' threshold", () => {
    const result = evaluatePerformanceThresholdTrigger(
      { dimension: "format", metric: "avgEngagementRate", comparator: "above", threshold: 0.1 },
      { groups: [{ key: "meme", avgEngagementRate: 0.3 }] },
    );
    expect(result.fired).toBe(true);
  });
});

describe("evaluateLowQueueTrigger", () => {
  it("fires when the ready queue is below the configured minimum", () => {
    expect(evaluateLowQueueTrigger({ minReadyCount: 10 }, { readyCount: 3 }).fired).toBe(true);
  });

  it("does not fire when the ready queue meets the minimum", () => {
    expect(evaluateLowQueueTrigger({ minReadyCount: 10 }, { readyCount: 10 }).fired).toBe(false);
  });
});

describe("evaluateNewBlueprintInNicheTrigger", () => {
  it("fires when a new matching blueprint appeared since the last fire", () => {
    const result = evaluateNewBlueprintInNicheTrigger(
      { nicheTag: "skincare" },
      { newestBlueprintCreatedAt: new Date("2026-06-02"), lastFiredAt: new Date("2026-06-01"), matchesNiche: true },
    );
    expect(result.fired).toBe(true);
  });

  it("does not fire when the newest matching blueprint is not newer than the last fire", () => {
    const result = evaluateNewBlueprintInNicheTrigger(
      { nicheTag: "skincare" },
      { newestBlueprintCreatedAt: new Date("2026-06-01"), lastFiredAt: new Date("2026-06-01"), matchesNiche: true },
    );
    expect(result.fired).toBe(false);
  });

  it("does not fire when nothing matches the niche", () => {
    const result = evaluateNewBlueprintInNicheTrigger({ nicheTag: "skincare" }, { newestBlueprintCreatedAt: null, lastFiredAt: null, matchesNiche: false });
    expect(result.fired).toBe(false);
  });
});

describe("evaluateCompetitorPostTrigger", () => {
  it("fires on a new observed post since the last fire", () => {
    const result = evaluateCompetitorPostTrigger({ competitorId: "c1" }, { newestObservedPostAt: new Date("2026-06-02"), lastFiredAt: new Date("2026-06-01") });
    expect(result.fired).toBe(true);
  });

  it("does not fire when there is no observed post at all", () => {
    const result = evaluateCompetitorPostTrigger({ competitorId: "c1" }, { newestObservedPostAt: null, lastFiredAt: null });
    expect(result.fired).toBe(false);
  });
});

describe("evaluateProductFeedChangeTrigger", () => {
  it("always reports not-implemented, honestly, rather than silently never firing", () => {
    const result = evaluateProductFeedChangeTrigger({ feedUrl: "https://example.com/feed.xml" });
    expect(result.fired).toBe(false);
    expect(result.reason).toContain("not implemented");
  });
});
