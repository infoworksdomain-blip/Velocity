import type { BlueprintStructure, ScoredBlueprint } from "@velocity/contracts";

/**
 * Retrieval scoring (STEP 8.3): cosine similarity, weighted by recency and
 * the blueprint's own velocity score. Deliberately a pure function over
 * already-fetched candidates, not a SQL query — the real pgvector `<=>`
 * ANN query against `trend_blueprint_library UNION ALL trend_blueprints`
 * is the caller's job (it needs a live Database connection this package
 * doesn't take a hard dependency on); this is the scoring/ranking algorithm
 * that query's results are passed through, and it's what's actually worth
 * unit-testing directly.
 */

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export interface BlueprintCandidate {
  id: string;
  structure: BlueprintStructure;
  embedding: number[];
  createdAt: Date;
}

const WEIGHT_SIMILARITY = 0.6;
const WEIGHT_VELOCITY = 0.25;
const WEIGHT_RECENCY = 0.15;
/** Normalises velocity_score onto roughly [0,1] — the DB column has no fixed max, this is a practical ceiling for the current corpus scale. */
const VELOCITY_NORMALISATION_CEILING = 100;

export function scoreBlueprints(
  candidates: BlueprintCandidate[],
  queryEmbedding: number[],
  now: Date,
  halfLifeDays = 14,
): ScoredBlueprint[] {
  const scored = candidates.map((candidate) => {
    const cosineSimilarity = cosine(candidate.embedding, queryEmbedding);
    const ageDays = Math.max(0, (now.getTime() - candidate.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const recencyFactor = Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
    const velocityFactor = Math.min(1, candidate.structure.velocityScore / VELOCITY_NORMALISATION_CEILING);

    const score = WEIGHT_SIMILARITY * cosineSimilarity + WEIGHT_VELOCITY * velocityFactor + WEIGHT_RECENCY * recencyFactor;

    return {
      id: candidate.id,
      structure: candidate.structure,
      score,
      cosineSimilarity,
      ageDays,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}
