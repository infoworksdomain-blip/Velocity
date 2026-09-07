import type { ProviderJobHandle, ProviderJobStatus, VideoJobInput, VideoProvider } from "../../types.js";
import { DeterministicJobStore } from "../shared/deterministic-job-store.js";

/** [UNVERIFIED FIXTURE — provider-adapter command] See kling.stub.ts's header — same caveat applies: manifest transcribed from the STEP 8 roster, not a verified API spec. */
const PROVIDER_ID = "veo-3.1";

export function createVeoStubProvider(tiers: string[]): VideoProvider {
  const store = new DeterministicJobStore(PROVIDER_ID, {
    processingMs: 350,
    costUsd: (input) => (input as VideoJobInput).durationSec * 0.2,
  });

  return {
    id: PROVIDER_ID,
    capabilities: {
      commercialUse: true,
      tiers,
      maxDurationSec: 8,
      resolutions: ["1080x1920"],
      nativeAudio: true,
      lipSync: true,
      imageToVideo: true,
      watermark: "model",
      costPerSecond: 0.2,
    },
    estimateCost(input) {
      return input.durationSec * 0.2;
    },
    async generate(input: VideoJobInput): Promise<ProviderJobHandle> {
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
