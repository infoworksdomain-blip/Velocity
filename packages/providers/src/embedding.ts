import { createHash } from "node:crypto";

/**
 * Embedding provider abstraction + a deterministic implementation (STEP 8).
 * A real embedding model (OpenAI/Voyage/etc.) needs a funded API key —
 * same credential-gated category as the video/TTS providers. Unlike those,
 * though, embedding similarity is cheap to make genuinely real without one:
 * this hashes character n-grams into a fixed-width vector and L2-normalises
 * it, which gives real, testable structure — related strings that share
 * n-grams score a genuinely higher cosine similarity than unrelated ones —
 * so blueprint retrieval (STEP 8.3) and the 0.92 hook-dedupe threshold
 * (STEP 8B.4) are exercised against real (if crude) semantics, not a
 * hand-typed fixture number.
 */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

const DIMENSIONS = 1536;
const NGRAM_SIZE = 3;

function hashNgramToIndex(ngram: string): number {
  const digest = createHash("sha256").update(ngram).digest();
  return digest.readUInt32BE(0) % DIMENSIONS;
}

function ngrams(text: string): string[] {
  const normalised = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalised.length < NGRAM_SIZE) return [normalised];
  const result: string[] = [];
  for (let i = 0; i <= normalised.length - NGRAM_SIZE; i++) {
    result.push(normalised.slice(i, i + NGRAM_SIZE));
  }
  return result;
}

function l2Normalise(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map((v) => v / magnitude);
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(DIMENSIONS).fill(0);
      for (const gram of ngrams(text)) {
        const index = hashNgramToIndex(gram);
        vector[index] = (vector[index] ?? 0) + 1;
      }
      return l2Normalise(vector);
    });
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
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
