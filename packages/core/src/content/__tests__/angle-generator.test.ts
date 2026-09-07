import { describe, expect, it } from "vitest";
import type { StructuredTextProvider } from "../angle-generator.js";
import { generateAngles } from "../angle-generator.js";
import type { UsageRecorderTx } from "../../metering/usage-recorder.js";

function makeFakeTx(): { tx: UsageRecorderTx; inserted: Record<string, unknown>[] } {
  const inserted: Record<string, unknown>[] = [];
  return { tx: { insert: () => ({ values: async (v) => void inserted.push(v) }) }, inserted };
}

function providerReturning(angleCount: number): StructuredTextProvider {
  return {
    id: "fake",
    model: "fake-model",
    generateStructured: async () => ({
      data: {
        angles: Array.from({ length: angleCount }, (_, i) => ({ kind: "pain_led", description: `angle ${i}` })),
      } as never,
      usage: { inputTokens: 10, outputTokens: 10 },
      costUsd: 0.005,
    }),
  };
}

const INPUT_BASE = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  product: "TaskFlow",
  category: "productivity",
  pains: ["disorganisation"],
  differentiators: ["AI-powered"],
};

describe("generateAngles", () => {
  it("returns exactly the requested count when the provider complies", async () => {
    const { tx } = makeFakeTx();
    const result = await generateAngles({ textProvider: providerReturning(5), tx }, { ...INPUT_BASE, angleCount: 5 });
    expect(result.angles).toHaveLength(5);
  });

  it("defensively truncates when the provider (stub or real) over-produces relative to the requested count", async () => {
    const { tx } = makeFakeTx();
    const result = await generateAngles({ textProvider: providerReturning(10), tx }, { ...INPUT_BASE, angleCount: 3 });
    expect(result.angles).toHaveLength(3);
  });

  it("meters the call and returns a usageEventId", async () => {
    const { tx, inserted } = makeFakeTx();
    const result = await generateAngles({ textProvider: providerReturning(2), tx }, { ...INPUT_BASE, angleCount: 2 });
    expect(result.usageEventId).toBeTruthy();
    expect(inserted).toHaveLength(2);
  });
});
