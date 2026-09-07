import type { ContentFormat } from "@velocity/contracts";

/**
 * `content_concepts.predicted_score` (STEP 8.2). This is a deterministic
 * heuristic, not a learned model — the real learned ranking is STEP 9's
 * Velocity bandit, which observes actual swipe/dwell-time signal this step
 * has no access to yet. Combines: the source blueprint's velocity score
 * (higher = the pattern is trending harder right now), a recency decay
 * (fresher signal is worth more), the angle-to-brand cosine similarity
 * (does this angle actually fit the brand), and a small per-format prior
 * (some formats convert better on average, per the build script's own
 * ordering of the four formats as roughly decreasing production cost).
 */

const FORMAT_PRIOR: Record<ContentFormat, number> = {
  hook_demo: 1.0,
  ai_ugc: 0.95,
  slideshow: 0.85,
  meme: 0.8,
};

const RECENCY_HALF_LIFE_DAYS = 14;

export interface PredictedScoreFeatures {
  blueprintVelocityScore: number | null; // null when no blueprint was matched
  blueprintAgeDays: number | null;
  angleBrandCosine: number;
  format: ContentFormat;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function predictConceptScore(features: PredictedScoreFeatures): number {
  const velocityFactor = features.blueprintVelocityScore === null ? 0.5 : clamp01(features.blueprintVelocityScore / 100);

  const recencyFactor =
    features.blueprintAgeDays === null
      ? 0.5
      : Math.exp((-Math.LN2 * features.blueprintAgeDays) / RECENCY_HALF_LIFE_DAYS);

  const brandFitFactor = clamp01((features.angleBrandCosine + 1) / 2); // cosine is [-1,1], rescale to [0,1]
  const formatPrior = FORMAT_PRIOR[features.format];

  return clamp01(0.35 * velocityFactor + 0.2 * recencyFactor + 0.3 * brandFitFactor + 0.15 * formatPrior);
}
