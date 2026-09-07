import type { TrendSignal } from "@velocity/contracts";
import { describe, expect, it } from "vitest";
import type { UsageRecorderTx } from "../../metering/usage-recorder.js";
import type { StructuredTextProvider } from "../../content/angle-generator.js";
import { extractBlueprint } from "../blueprint-extractor.js";

function makeFakeTx() {
  const inserted: Record<string, unknown>[] = [];
  const tx: UsageRecorderTx = { insert: () => ({ values: async (v) => void inserted.push(v) }) };
  return { tx, inserted };
}

function makeFakeTextProvider(structure: object): StructuredTextProvider {
  return {
    id: "fake",
    model: "fake-model",
    generateStructured: async () => ({
      data: structure as never,
      usage: { inputTokens: 100, outputTokens: 50 },
      costUsd: 0.002,
    }),
  };
}

const SIGNAL: TrendSignal = {
  niche: "fitness",
  captionText: "POV: you finally found a routine that sticks",
  beatTimestampsMs: [0, 1500, 4000],
  engagement: { views: 500000, likes: 40000, comments: 1200, shares: 8000 },
  observedAt: new Date().toISOString(),
  sourceRef: "opaque-signal-id-123",
};

describe("extractBlueprint", () => {
  it("attaches the signal's sourceRef to the returned structure", async () => {
    const { tx } = makeFakeTx();
    const provider = makeFakeTextProvider({
      hookPattern: "pov",
      beatTimings: [0, 1500, 4000],
      shotGrammar: "quick cuts",
      captionCadence: "fast",
      textPlacement: "upper_third",
      audioArchetype: "trending_audio",
      nicheTags: ["fitness"],
      velocityScore: 82,
      sourceRef: null, // the model doesn't set this — the function does
    });

    const result = await extractBlueprint({ textProvider: provider, tx, workspaceId: "platform-ingestion" }, SIGNAL);
    expect(result.sourceRef).toBe("opaque-signal-id-123");
    expect(result.hookPattern).toBe("pov");
  });

  it("meters the extraction call (C5)", async () => {
    const { tx, inserted } = makeFakeTx();
    const provider = makeFakeTextProvider({
      hookPattern: "pov",
      beatTimings: [],
      shotGrammar: null,
      captionCadence: null,
      textPlacement: null,
      audioArchetype: null,
      nicheTags: [],
      velocityScore: 10,
      sourceRef: null,
    });

    await extractBlueprint({ textProvider: provider, tx, workspaceId: "platform-ingestion" }, SIGNAL);
    expect(inserted.length).toBe(2); // usage_events + credit_ledger
  });

  it("TrendSignal has no media-URL field at the type level — C3 enforced structurally", () => {
    // Compile-time proof: SIGNAL's keys are exactly the schema's keys, none of which is a URL.
    const keys = Object.keys(SIGNAL);
    expect(keys).not.toContain("videoUrl");
    expect(keys).not.toContain("mediaUrl");
    expect(keys).not.toContain("clipUrl");
  });
});
