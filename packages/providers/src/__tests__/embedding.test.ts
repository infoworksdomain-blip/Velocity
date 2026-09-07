import { describe, expect, it } from "vitest";
import { cosineSimilarity, DeterministicEmbeddingProvider } from "../embedding.js";

describe("DeterministicEmbeddingProvider", () => {
  it("produces a 1536-dimension unit vector per text", async () => {
    const provider = new DeterministicEmbeddingProvider();
    const vectors = await provider.embed(["hello world"]);
    const vector = vectors[0]!;
    expect(vector).toHaveLength(1536);
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("is deterministic — the same text always produces the same vector", async () => {
    const provider = new DeterministicEmbeddingProvider();
    const a = (await provider.embed(["the quick brown fox"]))[0]!;
    const b = (await provider.embed(["the quick brown fox"]))[0]!;
    expect(a).toEqual(b);
  });

  it("gives genuinely higher cosine similarity to related strings than unrelated ones — this is the property blueprint retrieval and hook dedupe both depend on", async () => {
    const provider = new DeterministicEmbeddingProvider();
    const vectors = await provider.embed([
      "the best productivity app for busy founders",
      "the best productivity app for busy entrepreneurs",
      "adopt a rescue dog from your local shelter today",
    ]);
    const [a, b, c] = [vectors[0]!, vectors[1]!, vectors[2]!];

    const similarRelated = cosineSimilarity(a, b);
    const unrelated = cosineSimilarity(a, c);
    expect(similarRelated).toBeGreaterThan(unrelated);
  });

  it("cosine similarity of a vector with itself is 1", async () => {
    const provider = new DeterministicEmbeddingProvider();
    const a = (await provider.embed(["identical text"]))[0]!;
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it("cosineSimilarity throws on mismatched vector lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });

  it("near-duplicate hook text (STEP 8B.4's 0.92 threshold scenario) scores above 0.92", async () => {
    const provider = new DeterministicEmbeddingProvider();
    const vectors = await provider.embed([
      "Did you know about our new productivity app?",
      "Did you know about our new productivity app!",
    ]);
    expect(cosineSimilarity(vectors[0]!, vectors[1]!)).toBeGreaterThan(0.92);
  });
});
