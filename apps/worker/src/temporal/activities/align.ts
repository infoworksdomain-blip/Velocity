import { createHash } from "node:crypto";
import type { Alignment, FormatPlan } from "@velocity/contracts";
import { decodeWordsIfStubVo, encodeStubVoScript, type TranscriptionProvider } from "@velocity/providers";
import { getProviderRegistry, runInWorkspaceTx } from "./context.js";
import { withStep, type StepProviderStatus } from "./step-ledger.js";

const TRANSCRIPTION_PROVIDER_ID = "whisperx";

/** Word-level alignment of the VO (STEP 8.4). No-op (empty word list) for formats without voiceover. */
export async function align(workspaceId: string, renderId: string, formatPlan: FormatPlan, voiceoverOutputUrl: string | null): Promise<Alignment> {
  if (!formatPlan.voiceover || !voiceoverOutputUrl) return { words: [] };

  const registry = getProviderRegistry();
  const provider = registry.resolve<TranscriptionProvider>("transcription", {
    kind: "transcription",
    id: TRANSCRIPTION_PROVIDER_ID,
    enabled: true,
    weight: 100,
    tiers: [],
    adapter: "stub",
    credentials: {},
    breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 },
  });

  const audioUrl = encodeStubVoScript(formatPlan.voiceover.script);
  const stepKey = `align:${createHash("sha256").update(audioUrl).digest("hex").slice(0, 16)}`;

  const result = await withStep({
    runInWorkspaceTx: (fn) => runInWorkspaceTx(workspaceId, fn),
    workspaceId,
    renderId,
    stepKind: "align",
    stepKey,
    provider: { id: TRANSCRIPTION_PROVIDER_ID, model: TRANSCRIPTION_PROVIDER_ID },
    jobKind: "transcription",
    units: formatPlan.voiceover.script.length,
    submit: () => provider.transcribe({ audioUrl }),
    poll: async (handle) => (await provider.poll(handle)) as StepProviderStatus,
  });

  const words = decodeWordsIfStubVo(audioUrl) ?? [];
  void result;
  return { words };
}
