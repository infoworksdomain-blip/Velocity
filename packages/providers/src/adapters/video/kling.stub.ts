import type { ProviderJobHandle, ProviderJobStatus, VideoJobInput, VideoProvider } from "../../types.js";
import { DeterministicJobStore } from "../shared/deterministic-job-store.js";

/**
 * [UNVERIFIED FIXTURE — provider-adapter command] Kling 3.0's actual API is
 * not called here. This capability manifest is transcribed from the build
 * script's roster (line 251) and public vendor marketing claims, not from
 * a verified API spec — calling the real API needs a funded credential,
 * which is a decision to make separately, not to fabricate. The manifest
 * shape and generate/poll contract are real (VideoProvider, ADR 0004); the
 * numbers inside `capabilities` should be replaced with values confirmed
 * against Kling's actual API docs before this ever routes real spend.
 */
const PROVIDER_ID = "kling-3.0";

export function createKlingStubProvider(tiers: string[]): VideoProvider {
  const store = new DeterministicJobStore(PROVIDER_ID, {
    processingMs: 300,
    costUsd: (input) => (input as VideoJobInput).durationSec * 0.12,
  });

  return {
    id: PROVIDER_ID,
    capabilities: {
      commercialUse: true,
      tiers,
      maxDurationSec: 10,
      resolutions: ["1080x1920", "1920x1080"],
      nativeAudio: false,
      lipSync: true,
      imageToVideo: true,
      watermark: "none",
      costPerSecond: 0.12,
    },
    estimateCost(input) {
      return input.durationSec * 0.12;
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
