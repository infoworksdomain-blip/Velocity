import { describe, expect, it, vi } from "vitest";
import { recordUsage, type UsageRecorderTx } from "../usage-recorder.js";
import { CREDITS_PER_IMAGE, CREDITS_PER_TRANSCRIPTION_CALL, CREDITS_PER_VIDEO_SECOND } from "../../billing/credit-pricing.js";

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

  it("STEP 19: the credit_ledger debit is market-anchored (video: units == seconds, CREDITS_PER_VIDEO_SECOND each), not a function of the underlying provider's costUsd", async () => {
    const { tx, inserted } = makeFakeTx();
    await recordUsage(tx, {
      workspaceId: "11111111-1111-1111-1111-111111111111",
      provider: "kling",
      model: "kling-3.0",
      units: 5, // 5 seconds
      costUsd: 0.6, // deliberately NOT what determines the debit any more
      jobKind: "video",
    });
    expect(inserted[1]!.values.debit).toBe(5 * CREDITS_PER_VIDEO_SECOND);
  });

  it("an image job debits the flat CREDITS_PER_IMAGE rate regardless of units/costUsd", async () => {
    const { tx, inserted } = makeFakeTx();
    await recordUsage(tx, {
      workspaceId: "11111111-1111-1111-1111-111111111111",
      provider: "seedream",
      model: "seedream-5.0",
      units: 4,
      costUsd: 0.06,
      jobKind: "image",
    });
    expect(inserted[1]!.values.debit).toBe(CREDITS_PER_IMAGE);
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
    expect(inserted[1]!.values.debit).toBe(CREDITS_PER_TRANSCRIPTION_CALL);
    expect(inserted[1]!.values.debit as number).toBeGreaterThanOrEqual(1);
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
