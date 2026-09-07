import { describe, expect, it } from "vitest";
import { sampleConceptScore, type ConceptDimensions, type PreferenceState } from "../bandit";
import { computePreferenceUpdatesFromPerformance, type PublicationPerformanceInput } from "../performance-feedback";

function concept(format: string): ConceptDimensions {
  return { angleKind: "pain_led", format, personaId: null, blueprintId: null, hookPattern: null };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("computePreferenceUpdatesFromPerformance", () => {
  it("returns nothing for fewer than 3 items — not enough data for a meaningful stdev", () => {
    const items: PublicationPerformanceInput[] = [
      { publicationId: "p1", concept: concept("meme"), engagementRate: 0.1 },
      { publicationId: "p2", concept: concept("meme"), engagementRate: 0.9 },
    ];
    expect(computePreferenceUpdatesFromPerformance(items)).toEqual([]);
  });

  it("gives no update to any item when the threshold is set above every item's z-score — ordinary performance isn't evidence", () => {
    // With only 3 samples, even mild variation produces a volatile
    // z-score (small-n statistics) — rather than hand-picking values
    // whose z-scores happen to stay under a fixed threshold, this pins
    // the threshold itself far above whatever these items' real
    // z-scores are, isolating the "gate on threshold" behavior from
    // small-sample z-score arithmetic.
    const items: PublicationPerformanceInput[] = [
      { publicationId: "p1", concept: concept("meme"), engagementRate: 0.10 },
      { publicationId: "p2", concept: concept("meme"), engagementRate: 0.11 },
      { publicationId: "p3", concept: concept("meme"), engagementRate: 0.09 },
    ];
    expect(computePreferenceUpdatesFromPerformance(items, 100, 100)).toEqual([]);
  });

  it("applies a real +1 alpha to every dimension of a genuine statistical winner", () => {
    const items: PublicationPerformanceInput[] = [
      { publicationId: "p1", concept: concept("meme"), engagementRate: 0.10 },
      { publicationId: "p2", concept: concept("meme"), engagementRate: 0.11 },
      { publicationId: "p3", concept: concept("meme"), engagementRate: 0.09 },
      { publicationId: "winner", concept: concept("slideshow"), engagementRate: 0.90 },
    ];
    const updates = computePreferenceUpdatesFromPerformance(items);
    const formatUpdate = updates.find((u) => u.dimensionKey === "format:slideshow");
    expect(formatUpdate).toBeDefined();
    expect(formatUpdate!.alphaDelta).toBe(1);
    expect(formatUpdate!.betaDelta).toBe(0);
    // angle:pain_led is shared by every item, including the winner — it should also pick up the win.
    expect(updates.find((u) => u.dimensionKey === "angle:pain_led")?.alphaDelta).toBe(1);
  });

  it("applies a real +1 beta to a genuine statistical loser", () => {
    const items: PublicationPerformanceInput[] = [
      { publicationId: "p1", concept: concept("meme"), engagementRate: 0.50 },
      { publicationId: "p2", concept: concept("meme"), engagementRate: 0.52 },
      { publicationId: "p3", concept: concept("meme"), engagementRate: 0.48 },
      { publicationId: "loser", concept: concept("hook_demo"), engagementRate: 0.01 },
    ];
    const updates = computePreferenceUpdatesFromPerformance(items, 1, 1);
    const formatUpdate = updates.find((u) => u.dimensionKey === "format:hook_demo");
    expect(formatUpdate?.betaDelta).toBe(1);
    expect(formatUpdate?.alphaDelta).toBe(0);
  });

  /**
   * GATE 13's literal claim: "Bandit priors demonstrably shift after
   * ingesting winner data." Feeds real performance-derived updates into
   * the SAME preference map STEP 9's swipe-driven updates use, then
   * proves ranking behavior actually changed — the identical
   * before/after statistical-majority proof STEP 9's own
   * distribution-shift test already established for swipes, run here
   * against performance data instead.
   */
  it("GATE 13: ranking distribution measurably shifts toward the winning format after ingesting performance data", () => {
    const rng = mulberry32(42);
    const memeConcept = concept("meme");
    const slideshowConcept = concept("slideshow");
    const emptyPreferences = new Map<string, PreferenceState>();

    const TRIALS = 500;
    let slideshowWinsBefore = 0;
    for (let i = 0; i < TRIALS; i++) {
      const memeScore = sampleConceptScore(memeConcept, emptyPreferences, rng);
      const slideshowScore = sampleConceptScore(slideshowConcept, emptyPreferences, rng);
      if (slideshowScore > memeScore) slideshowWinsBefore++;
    }
    expect(slideshowWinsBefore / TRIALS).toBeGreaterThan(0.4);
    expect(slideshowWinsBefore / TRIALS).toBeLessThan(0.6); // roughly 50/50 cold-start, no data yet

    const items: PublicationPerformanceInput[] = [
      { publicationId: "p1", concept: memeConcept, engagementRate: 0.10 },
      { publicationId: "p2", concept: memeConcept, engagementRate: 0.11 },
      { publicationId: "p3", concept: memeConcept, engagementRate: 0.09 },
      { publicationId: "p4", concept: memeConcept, engagementRate: 0.10 },
      ...Array.from({ length: 10 }, (_, i) => ({ publicationId: `winner-${i}`, concept: slideshowConcept, engagementRate: 0.95 })),
    ];
    const updates = computePreferenceUpdatesFromPerformance(items);
    expect(updates.length).toBeGreaterThan(0);

    const preferencesAfter = new Map<string, PreferenceState>();
    for (const update of updates) {
      const prior = preferencesAfter.get(update.dimensionKey) ?? { alpha: 1, beta: 1 };
      preferencesAfter.set(update.dimensionKey, { alpha: prior.alpha + update.alphaDelta, beta: prior.beta + update.betaDelta });
    }

    let slideshowWinsAfter = 0;
    for (let i = 0; i < TRIALS; i++) {
      const memeScore = sampleConceptScore(memeConcept, preferencesAfter, rng);
      const slideshowScore = sampleConceptScore(slideshowConcept, preferencesAfter, rng);
      if (slideshowScore > memeScore) slideshowWinsAfter++;
    }

    // The actual claim: ranking demonstrably shifted toward the format that performed well, from a real ~50/50 cold start.
    expect(slideshowWinsAfter / TRIALS).toBeGreaterThan(0.75);
  });
});
