import type { BlueprintStructure } from "@velocity/contracts";
import { describe, expect, it } from "vitest";
import { scoreBlueprints, type BlueprintCandidate } from "../blueprint-retrieval.js";

function structure(overrides: Partial<BlueprintStructure> = {}): BlueprintStructure {
  return {
    hookPattern: "pov",
    beatTimings: [0, 1000],
    shotGrammar: null,
    captionCadence: null,
    textPlacement: null,
    audioArchetype: null,
    nicheTags: [],
    velocityScore: 50,
    sourceRef: null,
    ...overrides,
  };
}

const NOW = new Date("2026-06-01T00:00:00Z");

describe("scoreBlueprints", () => {
  it("ranks a highly-similar, high-velocity, recent blueprint above a dissimilar one", () => {
    const query = [1, 0, 0];
    const candidates: BlueprintCandidate[] = [
      { id: "a", structure: structure({ velocityScore: 90 }), embedding: [1, 0, 0], createdAt: NOW },
      { id: "b", structure: structure({ velocityScore: 10 }), embedding: [0, 1, 0], createdAt: NOW },
    ];

    const results = scoreBlueprints(candidates, query, NOW);
    expect(results[0]!.id).toBe("a");
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it("computes cosineSimilarity of 1 for an identical embedding", () => {
    const results = scoreBlueprints([{ id: "a", structure: structure(), embedding: [1, 0, 0], createdAt: NOW }], [1, 0, 0], NOW);
    expect(results[0]!.cosineSimilarity).toBeCloseTo(1, 5);
  });

  it("applies recency decay — an older blueprint scores lower than an otherwise-identical fresh one", () => {
    const query = [1, 0, 0];
    const fresh: BlueprintCandidate = { id: "fresh", structure: structure({ velocityScore: 50 }), embedding: [1, 0, 0], createdAt: NOW };
    const old: BlueprintCandidate = {
      id: "old",
      structure: structure({ velocityScore: 50 }),
      embedding: [1, 0, 0],
      createdAt: new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000), // 60 days old
    };

    const results = scoreBlueprints([fresh, old], query, NOW, 14);
    const freshResult = results.find((r) => r.id === "fresh")!;
    const oldResult = results.find((r) => r.id === "old")!;
    expect(freshResult.score).toBeGreaterThan(oldResult.score);
    expect(oldResult.ageDays).toBeCloseTo(60, 0);
  });

  it("sorts results descending by score", () => {
    const candidates: BlueprintCandidate[] = [
      { id: "low", structure: structure({ velocityScore: 5 }), embedding: [0, 1, 0], createdAt: NOW },
      { id: "high", structure: structure({ velocityScore: 95 }), embedding: [1, 0, 0], createdAt: NOW },
    ];
    const results = scoreBlueprints(candidates, [1, 0, 0], NOW);
    expect(results.map((r) => r.id)).toEqual(["high", "low"]);
  });

  it("throws on an embedding dimension mismatch", () => {
    const candidates: BlueprintCandidate[] = [{ id: "a", structure: structure(), embedding: [1, 0], createdAt: NOW }];
    expect(() => scoreBlueprints(candidates, [1, 0, 0], NOW)).toThrow();
  });
});
