import { createHash } from "node:crypto";
import type { FormatPlan } from "@velocity/contracts";
import type { TTSProvider } from "@velocity/providers";
import { getProviderRegistry, runInWorkspaceTx } from "./context.js";
import { withStep, type StepProviderStatus } from "./step-ledger.js";

const TTS_PROVIDER_ID = "elevenlabs";

export async function generateVo(workspaceId: string, renderId: string, formatPlan: FormatPlan, regenerationRound: number): Promise<string | null> {
  if (!formatPlan.voiceover) return null;

  const registry = getProviderRegistry();
  const provider = registry.resolve<TTSProvider>("tts", {
    kind: "tts",
    id: TTS_PROVIDER_ID,
    enabled: true,
    weight: 100,
    tiers: [],
    adapter: "stub",
    credentials: {},
    breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 },
  });

  const stepKey = `generate_vo:${createHash("sha256").update(JSON.stringify({ script: formatPlan.voiceover.script, regenerationRound })).digest("hex").slice(0, 16)}`;

  const result = await withStep({
    runInWorkspaceTx: (fn) => runInWorkspaceTx(workspaceId, fn),
    workspaceId,
    renderId,
    stepKind: "generate_vo",
    stepKey,
    provider: { id: TTS_PROVIDER_ID, model: TTS_PROVIDER_ID },
    jobKind: "tts",
    units: formatPlan.voiceover.script.length,
    submit: () => provider.generate(formatPlan.voiceover!),
    poll: async (handle) => (await provider.poll(handle)) as StepProviderStatus,
  });

  if (!result.output.outputUrl) throw new Error("VO generation succeeded with no outputUrl — provider contract violation");
  return result.output.outputUrl;
}
