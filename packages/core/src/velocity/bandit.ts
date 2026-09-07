/**
 * Thompson sampling (Beta-Bernoulli) over the Velocity queue's ranking
 * dimensions (build script STEP 9: "Thompson sampling over angle x format
 * x persona x blueprint x hook_pattern arms. Per-workspace preference
 * vector."). See schema/velocity.ts's own comment for why this decomposes
 * the 5-dimension joint arm into five independent per-dimension arms
 * (real bandit systems do this for exactly the sparsity reason documented
 * there) rather than sampling one Beta per unique 5-tuple.
 *
 * A real Gamma/Beta sampler, not a mean-only approximation — genuine
 * Thompson sampling needs to draw from the posterior (explore
 * proportionally to uncertainty), not just rank by the posterior mean
 * (which degenerates into pure exploitation and never explores an
 * under-tried arm).
 */

export type RandomSource = () => number; // uniform (0,1) — injected so tests are seeded/deterministic, matching this codebase's established pattern (auto-fit.test.ts, repair-loop.test.ts)

/**
 * Marsaglia-Tsang: samples Gamma(shape, 1) for shape >= 1. Every alpha/beta
 * this module ever samples starts at 1 (a Beta(1,1) prior) and only
 * increments by whole swipes, so shape is always a positive integer >= 1 —
 * the shape < 1 boost transform other Gamma samplers need is never
 * actually reachable here, and is deliberately not implemented as dead
 * code.
 */
export function sampleGamma(shape: number, rng: RandomSource): number {
  if (shape < 1) throw new Error(`sampleGamma: shape must be >= 1 (got ${shape}) — this bandit's alpha/beta never go below 1`);

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    let x: number;
    let v: number;
    do {
      // Box-Muller for a standard normal draw from two uniforms.
      const u1 = rng();
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;

    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(alpha: number, beta: number, rng: RandomSource): number {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  return x / (x + y);
}

export interface PreferenceState {
  alpha: number;
  beta: number;
}

const UNIFORM_PRIOR: PreferenceState = { alpha: 1, beta: 1 };

export interface ConceptDimensions {
  angleKind: string;
  format: string;
  personaId: string | null;
  blueprintId: string | null;
  hookPattern: string | null;
}

/** The dimension keys a concept participates in — omits persona/blueprint/hookPattern when null (a concept with no matched blueprint doesn't get penalized or rewarded on a "blueprint:null" arm that would mean nothing). */
export function dimensionKeysFor(concept: ConceptDimensions): string[] {
  const keys = [`angle:${concept.angleKind}`, `format:${concept.format}`];
  if (concept.personaId) keys.push(`persona:${concept.personaId}`);
  if (concept.blueprintId) keys.push(`blueprint:${concept.blueprintId}`);
  if (concept.hookPattern) keys.push(`hook_pattern:${concept.hookPattern}`);
  return keys;
}

/**
 * A concept's Thompson-sampled ranking score: the mean of one fresh Beta
 * sample per dimension it participates in (each dimension's arm sampled
 * independently, then averaged — the "combined at ranking time" step
 * schema/velocity.ts's comment refers to). Re-sampled on every ranking
 * call, by design: THIS is what makes it Thompson sampling rather than a
 * static leaderboard — an under-explored arm's wide posterior occasionally
 * samples high and gets a chance, even if its current mean is average.
 */
export function sampleConceptScore(concept: ConceptDimensions, preferences: ReadonlyMap<string, PreferenceState>, rng: RandomSource): number {
  const keys = dimensionKeysFor(concept);
  if (keys.length === 0) return sampleBeta(UNIFORM_PRIOR.alpha, UNIFORM_PRIOR.beta, rng);
  const samples = keys.map((key) => {
    const state = preferences.get(key) ?? UNIFORM_PRIOR;
    return sampleBeta(state.alpha, state.beta, rng);
  });
  return samples.reduce((sum, s) => sum + s, 0) / samples.length;
}

/** The alpha/beta increments a single swipe applies — a right swipe is a "win" (+1 alpha) for every dimension the concept participates in, a left swipe a "loss" (+1 beta). Pure: returns what to apply: the caller (packages/core has no DB access) persists it as an atomic upsert per key. */
export function preferenceUpdatesForSwipe(concept: ConceptDimensions, direction: "left" | "right"): { dimensionKey: string; alphaDelta: number; betaDelta: number }[] {
  return dimensionKeysFor(concept).map((dimensionKey) => ({
    dimensionKey,
    alphaDelta: direction === "right" ? 1 : 0,
    betaDelta: direction === "left" ? 1 : 0,
  }));
}
