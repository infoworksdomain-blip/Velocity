import type { ProviderJobHandle, ProviderJobStatus, TTSJobInput, TTSProvider } from "../../types.js";
import { DeterministicJobStore } from "../shared/deterministic-job-store.js";

/** [UNVERIFIED FIXTURE — provider-adapter command] ElevenLabs (or an equivalent TTS vendor, build script line 251) — manifest is a stand-in, not a verified API spec. Real integration needs a funded API key. */
const PROVIDER_ID = "elevenlabs";

export function createElevenLabsStubProvider(tiers: string[]): TTSProvider {
  const store = new DeterministicJobStore(PROVIDER_ID, {
    processingMs: 100,
    costUsd: (input) => (input as TTSJobInput).script.length * 0.00003,
  });

  return {
    id: PROVIDER_ID,
    capabilities: {
      commercialUse: true,
      tiers,
      costPerCharacter: 0.00003,
    },
    estimateCost(input) {
      return input.script.length * 0.00003;
    },
    async generate(input: TTSJobInput): Promise<ProviderJobHandle> {
      return store.generate(input);
    },
    async poll(handle: ProviderJobHandle): Promise<ProviderJobStatus> {
      return store.poll(handle.externalJobId);
    },
    async cancel(handle: ProviderJobHandle): Promise<void> {
      store.cancel(handle.externalJobId);
    },
  };
}
