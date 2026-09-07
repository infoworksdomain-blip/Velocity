import type { ProviderJobHandle, ProviderJobStatus, VideoJobInput, VideoProvider } from "../../types.js";
import { DeterministicJobStore } from "../shared/deterministic-job-store.js";

/** [UNVERIFIED FIXTURE — provider-adapter command] See kling.stub.ts's header — same caveat applies. */
const PROVIDER_ID = "minimax-h3";

export function createMinimaxStubProvider(tiers: string[]): VideoProvider {
  const store = new DeterministicJobStore(PROVIDER_ID, {
    processingMs: 200,
    costUsd: (input) => (input as VideoJobInput).durationSec * 0.06,
  });

  return {
    id: PROVIDER_ID,
    capabilities: {
      commercialUse: true,
      tiers,
      maxDurationSec: 6,
      resolutions: ["1080x1920"],
      nativeAudio: false,
      lipSync: true,
      imageToVideo: false,
      watermark: "none",
      costPerSecond: 0.06,
    },
    estimateCost(input) {
      return input.durationSec * 0.06;
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
