import { sampleConceptScore, type ConceptDimensions, type PreferenceState, type RandomSource } from "./bandit.js";

/**
 * Queue sizing (build script STEP 9: "maintains >=50 ranked concepts per
 * active workspace; background top-up below 10"). Named constants, not
 * magic numbers scattered at call sites — see queue-service.ts (apps/web)
 * for where these actually gate a real top-up trigger.
 */
export const QUEUE_TARGET_SIZE = 50;
export const QUEUE_TOP_UP_THRESHOLD = 10;

export interface RankableConcept extends ConceptDimensions {
  id: string;
  /** STEP 8.2's cold-start heuristic (predicted-score.ts) — blended in below so a brand-new workspace with an empty preferences map still gets a sensible order instead of a uniform coin-flip across every concept. */
  predictedScore: number;
}

export interface RankedConcept {
  id: string;
  score: number;
}

/**
 * Cold-start blend weight: with zero swipes recorded, every dimension's
 * Beta is the uniform Beta(1,1) prior — sampleConceptScore alone would
 * rank purely on sampling noise. Blending in STEP 8.2's brand-embedding-
 * derived predictedScore gives a real, non-random starting order; as real
 * preference signal accumulates (alpha/beta move away from 1,1), the
 * bandit component increasingly dominates on its own — no explicit
 * "graduation" logic needed, since a peaked Beta naturally samples closer
 * to its mean than a flat one does.
 */
const COLD_START_BLEND_WEIGHT = 0.4;

export function rankConcepts(concepts: RankableConcept[], preferences: ReadonlyMap<string, PreferenceState>, rng: RandomSource): RankedConcept[] {
  return concepts
    .map((concept) => {
      const banditScore = sampleConceptScore(concept, preferences, rng);
      const score = (1 - COLD_START_BLEND_WEIGHT) * banditScore + COLD_START_BLEND_WEIGHT * concept.predictedScore;
      return { id: concept.id, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function needsTopUp(currentQueueSize: number): boolean {
  return currentQueueSize < QUEUE_TOP_UP_THRESHOLD;
}

export function topUpCount(currentQueueSize: number): number {
  return Math.max(0, QUEUE_TARGET_SIZE - currentQueueSize);
}
