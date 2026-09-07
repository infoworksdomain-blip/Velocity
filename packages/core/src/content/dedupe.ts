/**
 * Near-duplicate hook rejection (STEP 8B.4: "reject above 0.92 so accounts
 * don't repeat themselves into invisibility"). A small local cosine
 * implementation rather than a new dependency on @velocity/providers for
 * one function — packages/core doesn't otherwise depend on it.
 */

export function cosine(a: number[], b: number[]): number {
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

export const DUPLICATE_COSINE_THRESHOLD = 0.92;

export interface DedupeCandidate<T> {
  item: T;
  embedding: number[];
}

/** Filters `candidates` down to those that are NOT near-duplicates of anything in `history` (or of an earlier-kept candidate in the same batch). */
export function rejectNearDuplicates<T>(
  candidates: DedupeCandidate<T>[],
  history: number[][],
  threshold = DUPLICATE_COSINE_THRESHOLD,
): T[] {
  const kept: T[] = [];
  const keptEmbeddings: number[][] = [];

  for (const candidate of candidates) {
    const isDuplicateOfHistory = history.some((h) => cosine(candidate.embedding, h) > threshold);
    const isDuplicateOfKept = keptEmbeddings.some((k) => cosine(candidate.embedding, k) > threshold);
    if (!isDuplicateOfHistory && !isDuplicateOfKept) {
      kept.push(candidate.item);
      keptEmbeddings.push(candidate.embedding);
    }
  }

  return kept;
}
