import { describe, expect, it } from "vitest";
import { needsTopUp, QUEUE_TOP_UP_THRESHOLD, rankConcepts, topUpCount, type RankableConcept } from "../queue.js";
import type { PreferenceState, RandomSource } from "../bandit.js";

function makeRng(seed: number): RandomSource {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state % 2147483646) / 2147483647 + 1e-9;
  };
}

let nextConceptSeq = 0;
function makeConcepts(count: number): RankableConcept[] {
  const formats = ["ai_ugc", "slideshow", "hook_demo", "meme"];
  return Array.from({ length: count }, () => {
    const seq = nextConceptSeq++;
    return {
      id: `concept-${seq}`,
      angleKind: `angle-${seq % 5}`,
      format: formats[seq % formats.length]!,
      personaId: null,
      blueprintId: null,
      hookPattern: null,
      predictedScore: 0.5,
    };
  });
}

/**
 * GATE 9: "Queue never starves in a 200-swipe session." A real,
 * DB-backed end-to-end version of this (against routers/velocity.ts,
 * which is what an actual session exercises) needs a PGlite-style test
 * harness for apps/web that does not exist yet in this codebase — apps/web
 * has no DB-integration test infrastructure at all yet (see
 * docs/steps/STEP-09.md's own honesty note). What IS real and tested here:
 * the exact same `needsTopUp`/`topUpCount`/`rankConcepts` functions the
 * router actually calls, driven through a closed-loop simulation of 200
 * real swipes against a real (simulated) concept pool with the same
 * top-up trigger logic the router uses — proving the THRESHOLDS and
 * TOP-UP MATH never let the pool starve, which is the actual mechanism
 * GATE 9's claim depends on.
 */
describe("GATE 9: the queue never starves across a 200-swipe session", () => {
  it("never drops to zero available concepts, given a top-up mechanism that reacts to needsTopUp", () => {
    let pool = makeConcepts(50); // QUEUE_TARGET_SIZE's own starting point
    let preferences = new Map<string, PreferenceState>();
    const rng = makeRng(2024);

    let minObservedPoolSize = pool.length;

    for (let swipeNumber = 0; swipeNumber < 200; swipeNumber++) {
      expect(pool.length).toBeGreaterThan(0); // the actual "never starves" assertion — fails loudly the instant it would

      const ranked = rankConcepts(pool, preferences, rng);
      const top = ranked[0]!;
      const swiped = pool.find((c) => c.id === top.id)!;

      // A real mixed swipe pattern (not all right, which would spend every concept into a render immediately) — roughly 30% approval, a realistic Blitz-style ratio.
      const direction = rng() < 0.3 ? "right" : "left";
      pool = pool.filter((c) => c.id !== swiped.id);

      const dimensionKeys = [`angle:${swiped.angleKind}`, `format:${swiped.format}`];
      for (const key of dimensionKeys) {
        const current = preferences.get(key) ?? { alpha: 1, beta: 1 };
        preferences = new Map(preferences).set(key, {
          alpha: current.alpha + (direction === "right" ? 1 : 0),
          beta: current.beta + (direction === "left" ? 1 : 0),
        });
      }

      if (needsTopUp(pool.length)) {
        pool = [...pool, ...makeConcepts(topUpCount(pool.length))];
      }

      minObservedPoolSize = Math.min(minObservedPoolSize, pool.length);
    }

    // A real property, not just "never exactly zero": the pool should
    // never even dip below the top-up threshold for long, since
    // needsTopUp fires the moment it does.
    expect(minObservedPoolSize).toBeGreaterThanOrEqual(QUEUE_TOP_UP_THRESHOLD - 1);
  });
});
