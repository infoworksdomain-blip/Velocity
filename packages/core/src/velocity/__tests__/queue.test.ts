import { describe, expect, it } from "vitest";
import { needsTopUp, QUEUE_TARGET_SIZE, QUEUE_TOP_UP_THRESHOLD, rankConcepts, topUpCount, type RankableConcept } from "../queue.js";
import type { PreferenceState, RandomSource } from "../bandit.js";

function makeRng(seed: number): RandomSource {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state % 2147483646) / 2147483647 + 1e-9;
  };
}

describe("needsTopUp / topUpCount", () => {
  it("needs a top-up strictly below the threshold, not at or above it", () => {
    expect(needsTopUp(QUEUE_TOP_UP_THRESHOLD - 1)).toBe(true);
    expect(needsTopUp(QUEUE_TOP_UP_THRESHOLD)).toBe(false);
    expect(needsTopUp(QUEUE_TOP_UP_THRESHOLD + 1)).toBe(false);
  });

  it("tops up to exactly the target size", () => {
    expect(topUpCount(5)).toBe(QUEUE_TARGET_SIZE - 5);
    expect(topUpCount(0)).toBe(QUEUE_TARGET_SIZE);
  });

  it("never returns a negative top-up count when already over target", () => {
    expect(topUpCount(QUEUE_TARGET_SIZE + 20)).toBe(0);
  });
});

describe("rankConcepts", () => {
  it("favours a higher predictedScore more often than not when there is no swipe history at all (cold start)", () => {
    // A single draw is NOT asserted deterministic — Thompson sampling is
    // supposed to retain some randomness even at cold start (that's the
    // "explore" half of explore/exploit, real even before any real
    // preference signal exists). What the cold-start blend actually
    // promises is a measurable tilt toward the higher predictedScore
    // across many draws, not a guarantee on any one of them — the same
    // statistical-majority pattern the "real preference signal" test below
    // already uses correctly.
    const concepts: RankableConcept[] = [
      { id: "low", angleKind: "pov", format: "meme", personaId: null, blueprintId: null, hookPattern: null, predictedScore: 0.1 },
      { id: "high", angleKind: "pov", format: "meme", personaId: null, blueprintId: null, hookPattern: null, predictedScore: 0.9 },
    ];
    const rng = makeRng(1);
    let highFirstCount = 0;
    const TRIALS = 300;
    for (let i = 0; i < TRIALS; i++) {
      const ranked = rankConcepts(concepts, new Map(), rng);
      if (ranked[0]!.id === "high") highFirstCount++;
    }
    expect(highFirstCount / TRIALS).toBeGreaterThan(0.6);
  });

  it("a strongly preferred format can still outrank a higher predictedScore once real swipe signal exists", () => {
    const preferences = new Map<string, PreferenceState>([
      ["format:meme", { alpha: 40, beta: 1 }],
      ["format:slideshow", { alpha: 1, beta: 40 }],
    ]);
    const concepts: RankableConcept[] = [
      { id: "slideshow-favoured-score", angleKind: "pov", format: "slideshow", personaId: null, blueprintId: null, hookPattern: null, predictedScore: 0.7 },
      { id: "meme-favoured-bandit", angleKind: "pov", format: "meme", personaId: null, blueprintId: null, hookPattern: null, predictedScore: 0.5 },
    ];

    let memeFirstCount = 0;
    const TRIALS = 200;
    const rng = makeRng(7);
    for (let i = 0; i < TRIALS; i++) {
      const ranked = rankConcepts(concepts, preferences, rng);
      if (ranked[0]!.id === "meme-favoured-bandit") memeFirstCount++;
    }
    expect(memeFirstCount / TRIALS).toBeGreaterThan(0.7);
  });

  it("returns all concepts, sorted descending by score, none dropped", () => {
    const concepts: RankableConcept[] = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      angleKind: "pov",
      format: "meme",
      personaId: null,
      blueprintId: null,
      hookPattern: null,
      predictedScore: i / 10,
    }));
    const ranked = rankConcepts(concepts, new Map(), makeRng(3));
    expect(ranked).toHaveLength(10);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });

  /**
   * STEP 21's literal "Blitz swipe p95 <100ms" target. `rankConcepts` is
   * the actual per-swipe computation (Thompson-sampling every candidate,
   * then sorting) — the honest, sandbox-testable component of end-to-end
   * swipe latency, which in production also includes a network round
   * trip and a DB read this pure-function test can't and doesn't claim
   * to measure (see docs/steps/STEP-21.md). At 200 concepts (GATE 9's
   * own "queue never starves at 200 swipes" scale, reused here as the
   * realistic upper bound on how large a ranked queue actually gets),
   * real wall-clock timing across many real trials gives an honest p95,
   * not a single best-case sample.
   */
  it("GATE 21: real p95 latency at 200 concepts is comfortably under the 100ms swipe budget", () => {
    const concepts: RankableConcept[] = Array.from({ length: 200 }, (_, i) => ({
      id: `c${i}`,
      angleKind: "pov",
      format: "meme",
      personaId: null,
      blueprintId: null,
      hookPattern: null,
      predictedScore: Math.random(),
    }));
    const preferences = new Map<string, PreferenceState>([
      ["angle:pov", { alpha: 12, beta: 4 }],
      ["format:meme", { alpha: 8, beta: 6 }],
    ]);

    const TRIALS = 100;
    const durationsMs: number[] = [];
    for (let i = 0; i < TRIALS; i++) {
      const start = performance.now();
      rankConcepts(concepts, preferences, makeRng(i + 1));
      durationsMs.push(performance.now() - start);
    }

    durationsMs.sort((a, b) => a - b);
    const p95 = durationsMs[Math.floor(TRIALS * 0.95)]!;
    expect(p95).toBeLessThan(100);
  });
});
