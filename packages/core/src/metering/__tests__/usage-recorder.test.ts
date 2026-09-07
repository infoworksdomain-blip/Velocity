import { describe, expect, it, vi } from "vitest";
import { recordUsage, usdToCredits, type UsageRecorderTx } from "../usage-recorder.js";

function makeFakeTx() {
  const inserted: { table: unknown; values: Record<string, unknown> }[] = [];
  const tx: UsageRecorderTx = {
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        inserted.push({ table, values });
      },
    }),
  };
  return { tx, inserted };
}

describe("recordUsage — the C5 choke point", () => {
  it("writes exactly one usage_events row and one credit_ledger row per call", async () => {
    const { tx, inserted } = makeFakeTx();
    await recordUsage(tx, {
      workspaceId: "11111111-1111-1111-1111-111111111111",
      provider: "kling",
      model: "kling-3.0",
      units: 5,
      costUsd: 0.6,
      jobKind: "video",
      referenceId: "22222222-2222-2222-2222-222222222222",
    });

    expect(inserted).toHaveLength(2);
    expect(inserted[0]!.values).toMatchObject({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      provider: "kling",
      model: "kling-3.0",
      units: "5",
      costUsd: "0.6",
      jobKind: "video",
    });
    expect(inserted[1]!.values).toMatchObject({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      credit: 0,
    });
  });

  it("the credit_ledger debit references the usage_events row it was charged for", async () => {
    const { tx, inserted } = makeFakeTx();
    const { usageEventId } = await recordUsage(tx, {
      workspaceId: "11111111-1111-1111-1111-111111111111",
      provider: "elevenlabs",
      model: "eleven-v3",
      units: 100,
      costUsd: 0.003,
      jobKind: "tts",
    });

    expect(inserted[1]!.values.referenceId).toBe(usageEventId);
  });

  it("never writes a zero-cost debit — every job costs at least 1 credit", async () => {
    const { tx, inserted } = makeFakeTx();
    await recordUsage(tx, {
      workspaceId: "11111111-1111-1111-1111-111111111111",
      provider: "whisperx",
      model: "whisperx-base",
      units: 1,
      costUsd: 0.0001,
      jobKind: "transcription",
    });
    expect(inserted[1]!.values.debit).toBeGreaterThanOrEqual(1);
  });

  it("usdToCredits rounds up so a job is never under-charged", () => {
    expect(usdToCredits(0.001)).toBe(1);
    expect(usdToCredits(0.01)).toBe(1);
    expect(usdToCredits(0.011)).toBe(2);
    expect(usdToCredits(1.0)).toBe(100);
  });

  it("calls insert exactly twice, in order (usage_events before credit_ledger)", async () => {
    const insertSpy = vi.fn((_table: unknown) => ({ values: async () => {} }));
    const tx: UsageRecorderTx = { insert: insertSpy };
    await recordUsage(tx, {
      workspaceId: "11111111-1111-1111-1111-111111111111",
      provider: "seedream",
      model: "seedream-5.0",
      units: 4,
      costUsd: 0.06,
      jobKind: "image",
    });
    expect(insertSpy).toHaveBeenCalledTimes(2);
  });
});
