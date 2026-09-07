import { createHash } from "node:crypto";
import type { FormatPlan, ShotSpec } from "@velocity/contracts";
import type { ImageProvider, VideoProvider } from "@velocity/providers";
import { getProviderRegistry, runInWorkspaceTx } from "./context.js";
import { withStep, type StepProviderStatus } from "./step-ledger.js";

/**
 * One render_steps row per shot (STEP 8.4) — a retried activity re-derives
 * the SAME stepKey per shot from the shot's own content, so 4 already-
 * generated shots are found cached and reused on retry, never re-billed
 * (build script line 269's literal example). `regenerationRound` is part
 * of the key on purpose: a worker-crash retry keeps the same round and
 * hits the cache; a QC-triggered regeneration bumps the round, which
 * must produce a genuinely new step (and a new provider call) rather than
 * silently replaying the same failed content forever.
 */
function shotStepKey(shot: ShotSpec, regenerationRound: number): string {
  const hash = createHash("sha256").update(JSON.stringify({ shot, regenerationRound })).digest("hex").slice(0, 16);
  return `generate_shot:${shot.shotIndex}:${hash}`;
}

export async function generateShots(
  workspaceId: string,
  renderId: string,
  formatPlan: FormatPlan,
  providerId: string,
  regenerationRound: number,
): Promise<string[]> {
  const registry = getProviderRegistry();
  const outputs: string[] = [];

  for (const shot of formatPlan.shots) {
    const provider = registry.resolve<VideoProvider | ImageProvider>(formatPlan.outputsImageSet ? "image" : "video", {
      kind: formatPlan.outputsImageSet ? "image" : "video",
      id: providerId,
      enabled: true,
      weight: 100,
      tiers: [],
      adapter: "stub",
      credentials: {},
      breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 },
    });

    const result = await withStep({
      runInWorkspaceTx: (fn) => runInWorkspaceTx(workspaceId, fn),
      workspaceId,
      renderId,
      stepKind: "generate_shot",
      stepKey: shotStepKey(shot, regenerationRound),
      provider: { id: providerId, model: providerId },
      jobKind: formatPlan.outputsImageSet ? "image" : "video",
      units: shot.durationSec,
      submit: async () => {
        if (formatPlan.outputsImageSet) {
          return (provider as ImageProvider).generate({ prompt: shot.prompt, referenceImageUrl: shot.referenceImageUrl ?? undefined, count: 1 });
        }
        return (provider as VideoProvider).generate({
          prompt: shot.prompt,
          referenceImageUrl: shot.referenceImageUrl ?? undefined,
          durationSec: shot.durationSec,
          resolution: shot.resolution,
        });
      },
      poll: async (handle) => {
        const status = formatPlan.outputsImageSet
          ? await (provider as ImageProvider).poll(handle)
          : await (provider as VideoProvider).poll(handle);
        return status as StepProviderStatus;
      },
    });

    if (!result.output.outputUrl) throw new Error(`Shot ${shot.shotIndex} succeeded with no outputUrl — provider contract violation`);
    outputs.push(result.output.outputUrl);
  }

  return outputs;
}
