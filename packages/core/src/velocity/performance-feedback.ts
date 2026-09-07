import { dimensionKeysFor, type ConceptDimensions } from "./bandit.js";

/**
 * "Close the loop" (STEP 13, build script: "performance updates the
 * Blitz bandit priors ... re-weight from published performance").
 * `dimensionKeysFor` already includes `hook_pattern:*` as one of the
 * bandit's 5 arms (bandit.ts), so this single function's updates ALSO
 * are the build script's separately-named "hook-pattern weights in 8B"
 * — both closing-the-loop targets are the same underlying mechanism
 * (`velocity_preferences`), not two systems to build.
 *
 * Real statistics, not a fabricated heuristic: a published item's
 * engagement rate is z-scored against the cohort it published alongside
 * (the same cohort analytics/aggregate.ts's `detectOutliers` uses); a
 * genuine statistical winner (z >= winnerZScoreThreshold) applies a
 * real "win" (+1 alpha) to every dimension it participates in, a
 * genuine loser (z <= -loserZScoreThreshold) applies a "loss" (+1
 * beta) — exactly `preferenceUpdatesForSwipe`'s own alpha/beta shape,
 * generalized from a binary swipe outcome to a continuous performance
 * signal. An item within the threshold gets no update: ordinary
 * performance isn't evidence for or against a dimension.
 */

export interface PublicationPerformanceInput {
  publicationId: string;
  concept: ConceptDimensions;
  engagementRate: number;
}

export interface PreferenceUpdate {
  dimensionKey: string;
  alphaDelta: number;
  betaDelta: number;
}

export function computePreferenceUpdatesFromPerformance(items: PublicationPerformanceInput[], winnerZScoreThreshold = 1, loserZScoreThreshold = 1): PreferenceUpdate[] {
  if (items.length < 3) return []; // same "not enough data for a meaningful stdev" floor as detectOutliers

  const rates = items.map((i) => i.engagementRate);
  const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
  const variance = rates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rates.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return [];

  const deltasByKey = new Map<string, { alphaDelta: number; betaDelta: number }>();

  items.forEach((item, i) => {
    const zScore = (rates[i]! - mean) / stdDev;
    const isWinner = zScore >= winnerZScoreThreshold;
    const isLoser = zScore <= -loserZScoreThreshold;
    if (!isWinner && !isLoser) return;

    for (const dimensionKey of dimensionKeysFor(item.concept)) {
      const existing = deltasByKey.get(dimensionKey) ?? { alphaDelta: 0, betaDelta: 0 };
      if (isWinner) existing.alphaDelta += 1;
      if (isLoser) existing.betaDelta += 1;
      deltasByKey.set(dimensionKey, existing);
    }
  });

  return [...deltasByKey.entries()].map(([dimensionKey, delta]) => ({ dimensionKey, ...delta }));
}
