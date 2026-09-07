import { describe, expect, it } from "vitest";
import { dimensionKeysFor, preferenceUpdatesForSwipe, sampleBeta, sampleConceptScore, sampleGamma, type PreferenceState, type RandomSource } from "../bandit.js";

function makeRng(seed: number): RandomSource {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    // Avoid exactly 0 (sampleGamma's Box-Muller takes log(u1)) and exactly 1.
    return (state % 2147483646) / 2147483647 + 1e-9;
  };
}

function meanAndVariance(samples: number[]): { mean: number; variance: number } {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  return { mean, variance };
}

describe("sampleGamma", () => {
  it("throws for shape < 1 — this bandit's alpha/beta never go below 1, so this path should never be silently wrong", () => {
    expect(() => sampleGamma(0.5, makeRng(1))).toThrow();
  });

  it("Gamma(shape,1) samples have mean ≈ shape", () => {
    const rng = makeRng(42);
    const samples = Array.from({ length: 20000 }, () => sampleGamma(5, rng));
    const { mean } = meanAndVariance(samples);
    expect(mean).toBeGreaterThan(4.7);
    expect(mean).toBeLessThan(5.3);
  });
});

describe("sampleBeta", () => {
  it.each([
    [1, 1],
    [2, 5],
    [10, 3],
    [50, 50],
  ])("Beta(%i,%i) samples match the theoretical mean and variance", (alpha, beta) => {
    const rng = makeRng(alpha * 1000 + beta);
    const samples = Array.from({ length: 20000 }, () => sampleBeta(alpha, beta, rng));
    const { mean, variance } = meanAndVariance(samples);

    const expectedMean = alpha / (alpha + beta);
    const expectedVariance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));

    expect(mean).toBeCloseTo(expectedMean, 1);
    expect(variance).toBeCloseTo(expectedVariance, 2);
  });

  it("always returns a value in (0,1)", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 5000; i++) {
      const s = sampleBeta(3, 4, rng);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(1);
    }
  });
});

describe("dimensionKeysFor", () => {
  it("includes all five dimensions when every field is present", () => {
    const keys = dimensionKeysFor({ angleKind: "pain_led", format: "meme", personaId: "p1", blueprintId: "b1", hookPattern: "curiosity_gap" });
    expect(keys).toEqual(["angle:pain_led", "format:meme", "persona:p1", "blueprint:b1", "hook_pattern:curiosity_gap"]);
  });

  it("omits null dimensions rather than encoding them as a meaningless null arm", () => {
    const keys = dimensionKeysFor({ angleKind: "pov", format: "slideshow", personaId: null, blueprintId: null, hookPattern: null });
    expect(keys).toEqual(["angle:pov", "format:slideshow"]);
  });
});

describe("preferenceUpdatesForSwipe", () => {
  const concept = { angleKind: "pain_led", format: "meme", personaId: null, blueprintId: null, hookPattern: "curiosity_gap" };

  it("a right swipe increments alpha (a win) for every dimension the concept participates in", () => {
    const updates = preferenceUpdatesForSwipe(concept, "right");
    expect(updates).toEqual([
      { dimensionKey: "angle:pain_led", alphaDelta: 1, betaDelta: 0 },
      { dimensionKey: "format:meme", alphaDelta: 1, betaDelta: 0 },
      { dimensionKey: "hook_pattern:curiosity_gap", alphaDelta: 1, betaDelta: 0 },
    ]);
  });

  it("a left swipe increments beta (a loss) instead", () => {
    const updates = preferenceUpdatesForSwipe(concept, "left");
    expect(updates.every((u) => u.alphaDelta === 0 && u.betaDelta === 1)).toBe(true);
  });
});

describe("sampleConceptScore", () => {
  it("is deterministic for a given rng sequence", () => {
    const concept = { angleKind: "pov", format: "meme", personaId: null, blueprintId: null, hookPattern: "curiosity_gap" };
    const prefs = new Map<string, PreferenceState>([["angle:pov", { alpha: 5, beta: 2 }]]);
    const a = sampleConceptScore(concept, prefs, makeRng(1));
    const b = sampleConceptScore(concept, prefs, makeRng(1));
    expect(a).toBe(b);
  });

  /**
   * GATE 9's literal claim: "Preference model measurably shifts the served
   * distribution after 50 swipes." Simulates a workspace that has
   * consistently swiped right on "meme" format and left on "slideshow" 50
   * times, then asserts meme-format concepts now rank ABOVE
   * slideshow-format concepts with overwhelming, measured frequency —
   * not just "on average" but specifically the property a served ranking
   * actually depends on.
   */
  it("GATE 9: after 50 consistent swipes, the served ranking measurably favors the preferred dimension", () => {
    let preferences = new Map<string, PreferenceState>();
    const swipeRng = makeRng(99);

    for (let i = 0; i < 50; i++) {
      const memeUpdates = preferenceUpdatesForSwipe({ angleKind: "pov", format: "meme", personaId: null, blueprintId: null, hookPattern: null }, "right");
      const slideshowUpdates = preferenceUpdatesForSwipe({ angleKind: "pov", format: "slideshow", personaId: null, blueprintId: null, hookPattern: null }, "left");
      for (const update of [...memeUpdates, ...slideshowUpdates]) {
        const current = preferences.get(update.dimensionKey) ?? { alpha: 1, beta: 1 };
        preferences = new Map(preferences).set(update.dimensionKey, { alpha: current.alpha + update.alphaDelta, beta: current.beta + update.betaDelta });
      }
      void swipeRng; // trial ordering itself isn't randomized — only the eventual ranking draws below are
    }

    const rankingRng = makeRng(123);
    const memeConcept = { angleKind: "pov", format: "meme", personaId: null, blueprintId: null, hookPattern: null };
    const slideshowConcept = { angleKind: "pov", format: "slideshow", personaId: null, blueprintId: null, hookPattern: null };

    let memeRankedHigher = 0;
    const TRIALS = 500;
    for (let i = 0; i < TRIALS; i++) {
      const memeScore = sampleConceptScore(memeConcept, preferences, rankingRng);
      const slideshowScore = sampleConceptScore(slideshowConcept, preferences, rankingRng);
      if (memeScore > slideshowScore) memeRankedHigher++;
    }

    // Before any swipes, this would be ~50/50 (both Beta(1,1)) — the assertion below is the actual "measurable shift" GATE 9 asks for.
    expect(memeRankedHigher / TRIALS).toBeGreaterThan(0.9);
  });
});
