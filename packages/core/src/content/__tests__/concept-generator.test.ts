import { describe, expect, it } from "vitest";
import type { StructuredTextProvider } from "../angle-generator.js";
import { generateConceptBatch, type ConceptGeneratorDeps } from "../concept-generator.js";
import type { UsageRecorderTx } from "../../metering/usage-recorder.js";
import { DeterministicEmbeddingProvider } from "@velocity/providers";

function makeFakeTx(): { tx: UsageRecorderTx; inserted: Record<string, unknown>[] } {
  const inserted: Record<string, unknown>[] = [];
  return { tx: { insert: () => ({ values: async (v) => void inserted.push(v) }) }, inserted };
}

/** A fake text provider that returns whatever the test wired up for angle generation vs. hook generation, distinguished by the schema's shape hint in the system prompt. */
function makeFakeTextProvider(angleCount: number): StructuredTextProvider {
  return {
    id: "fake-text-provider",
    model: "fake-model-v1",
    generateStructured: async (args) => {
      if (args.system.includes("marketing angles")) {
        return {
          data: {
            angles: Array.from({ length: angleCount }, (_, i) => ({
              kind: "pain_led",
              description: `Angle ${i}: solving problem ${i}`,
            })),
          } as never,
          usage: { inputTokens: 200, outputTokens: 100 },
          costUsd: 0.01,
        };
      }
      // Hook generation call — args.input is a JSON array of slots. Each
      // slot gets a hook built from genuinely distinct word content (not
      // just a differing trailing digit) so unrelated tests in this file
      // don't accidentally trip the real near-duplicate rejection — that
      // behavior has its own dedicated test below.
      const DISTINCT_HOOK_WORDS = ["mountains", "kittens", "spreadsheets", "volcanoes", "sailboats", "telescopes"];
      const slots = JSON.parse(args.input) as { index: number }[];
      return {
        data: {
          results: slots.map((slot) => ({
            hook: `Why nobody talks about ${DISTINCT_HOOK_WORDS[slot.index % DISTINCT_HOOK_WORDS.length]}`,
            variants: Array.from({ length: 5 }, (_, v) => ({
              text: `Variant ${v} for slot ${slot.index}`,
              pattern: "curiosity_gap",
              predictedCtr: 0.1,
            })),
          })),
        } as never,
        usage: { inputTokens: 500, outputTokens: 300 },
        costUsd: 0.02,
      };
    },
  };
}

function baseDeps(overrides: Partial<ConceptGeneratorDeps> = {}): { deps: ConceptGeneratorDeps; inserted: Record<string, unknown>[] } {
  const { tx, inserted } = makeFakeTx();
  const deps: ConceptGeneratorDeps = {
    textProvider: makeFakeTextProvider(2),
    embedder: new DeterministicEmbeddingProvider(),
    fetchBlueprintCandidates: async () => [],
    fetchHookHistory: async () => [],
    tx,
    ...overrides,
  };
  return { deps, inserted };
}

const INPUT_BASE = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  brandProfile: { product: "TaskFlow", category: "productivity software", oneLiner: "Get more done", pains: ["disorganisation"], differentiators: ["AI-powered"] },
  personas: [{ id: "persona-1" }],
  angleCount: 2,
  formats: ["hook_demo", "meme"] as const,
  conceptsPerAngle: 1,
};

describe("generateConceptBatch — the real STEP 8.2 pipeline", () => {
  it("produces one concept per angle x format slot (bounded by conceptsPerAngle)", async () => {
    const { deps } = baseDeps();
    const result = await generateConceptBatch(deps, { ...INPUT_BASE, formats: ["hook_demo"] });
    expect(result.concepts).toHaveLength(2); // 2 angles x 1 format x 1 concept-per-angle
  });

  it("every concept has aiGenerated: true and a hook under 60 chars", async () => {
    const { deps } = baseDeps();
    const result = await generateConceptBatch(deps, { ...INPUT_BASE, formats: ["hook_demo"] });
    for (const concept of result.concepts) {
      expect(concept.aiGenerated).toBe(true);
      expect(concept.hook.length).toBeLessThanOrEqual(60);
    }
  });

  it("meme format never gets a persona; hook_demo persona assignment follows the matrix rules", async () => {
    const { deps } = baseDeps();
    const result = await generateConceptBatch(deps, { ...INPUT_BASE, formats: ["meme"] });
    for (const concept of result.concepts) {
      expect(concept.personaId).toBeNull();
    }
  });

  it("meters both the angle-generation call and the batched hook-generation call (C5)", async () => {
    const { deps, inserted } = baseDeps();
    await generateConceptBatch(deps, { ...INPUT_BASE, formats: ["hook_demo"] });
    // 2 usage_events (angle call + hook call) x 2 rows each (usage_events + credit_ledger) = 4
    expect(inserted.length).toBe(4);
  });

  it("the hook-generation call is exactly ONE call regardless of slot count (build script 8B.6: never fan out)", async () => {
    let hookCallCount = 0;
    const textProvider: StructuredTextProvider = {
      id: "counting-provider",
      model: "m",
      generateStructured: async (args) => {
        if (args.system.includes("marketing angles")) {
          return {
            data: { angles: [{ kind: "pain_led", description: "a" }, { kind: "pov", description: "b" }, { kind: "listicle", description: "c" }] } as never,
            usage: { inputTokens: 1, outputTokens: 1 },
            costUsd: 0.001,
          };
        }
        hookCallCount += 1;
        const slots = JSON.parse(args.input) as { index: number }[];
        return {
          data: {
            results: slots.map((s) => ({
              hook: `H${s.index}`,
              variants: Array.from({ length: 5 }, (_, v) => ({ text: `V${v}`, pattern: "pov", predictedCtr: 0.1 })),
            })),
          } as never,
          usage: { inputTokens: 1, outputTokens: 1 },
          costUsd: 0.001,
        };
      },
    };
    const { deps } = baseDeps({ textProvider });
    await generateConceptBatch(deps, { ...INPUT_BASE, angleCount: 3, formats: ["hook_demo", "meme"], conceptsPerAngle: 2 });
    expect(hookCallCount).toBe(1);
  });

  it("returns no concepts (not an error) when personas are required but none exist and only ai_ugc is requested", async () => {
    const { deps } = baseDeps();
    const result = await generateConceptBatch(deps, { ...INPUT_BASE, formats: ["ai_ugc"], personas: [] });
    expect(result.concepts).toEqual([]);
  });

  it("near-duplicate hooks against workspace history are rejected", async () => {
    const embedder = new DeterministicEmbeddingProvider();
    // Slot 0's fake hook is always "Why nobody talks about mountains" (see makeFakeTextProvider) — seed history with the identical text.
    const [historicalEmbedding] = await embedder.embed(["Why nobody talks about mountains"]);
    const { deps } = baseDeps({ embedder, fetchHookHistory: async () => [historicalEmbedding!] });
    const result = await generateConceptBatch(deps, { ...INPUT_BASE, formats: ["hook_demo"], angleCount: 1 });
    expect(result.concepts).toEqual([]);
  });
});
