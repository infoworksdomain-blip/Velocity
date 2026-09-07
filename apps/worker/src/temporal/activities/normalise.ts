import { createHash } from "node:crypto";
import { getLoudnessNormaliser, runInWorkspaceTx } from "./context.js";
import { withStep } from "./step-ledger.js";

export interface NormaliseResult {
  outputStorageKey: string;
  measuredLufs: number | null;
  skipped: boolean;
}

export async function normalise(workspaceId: string, renderId: string, inputStorageKey: string): Promise<NormaliseResult> {
  const normaliser = getLoudnessNormaliser();
  const stepKey = `normalise:${createHash("sha256").update(inputStorageKey).digest("hex").slice(0, 16)}`;

  const result = await withStep({
    runInWorkspaceTx: (fn) => runInWorkspaceTx(workspaceId, fn),
    workspaceId,
    renderId,
    stepKind: "normalise",
    stepKey,
    provider: { id: "loudness-normaliser", model: "pass-through" },
    jobKind: "video",
    units: 0,
    skipMetering: true,
    submit: async () => {
      const output = await normaliser.normalise(inputStorageKey);
      return { providerId: "loudness-normaliser", externalJobId: JSON.stringify(output) };
    },
    poll: async (handle) => {
      const output = JSON.parse(handle.externalJobId) as NormaliseResult;
      return { state: "succeeded", costUsd: 0, ...output };
    },
  });

  return {
    outputStorageKey: result.output.outputStorageKey as string,
    measuredLufs: (result.output.measuredLufs as number | null) ?? null,
    skipped: result.output.skipped as boolean,
  };
}
