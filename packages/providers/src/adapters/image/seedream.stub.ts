import type { ImageJobInput, ImageProvider, ProviderJobHandle, ProviderJobStatus } from "../../types.js";
import { DeterministicJobStore } from "../shared/deterministic-job-store.js";

/** [UNVERIFIED FIXTURE — provider-adapter command] See kling.stub.ts's header — same caveat applies. */
const PROVIDER_ID = "seedream-5.0";

export function createSeedreamStubProvider(tiers: string[]): ImageProvider {
  const store = new DeterministicJobStore(PROVIDER_ID, {
    processingMs: 150,
    costUsd: (input) => (input as ImageJobInput).count * 0.015,
  });

  return {
    id: PROVIDER_ID,
    capabilities: {
      commercialUse: true,
      tiers,
      watermark: "none",
      costPerImage: 0.015,
    },
    estimateCost(input) {
      return input.count * 0.015;
    },
    async generate(input: ImageJobInput): Promise<ProviderJobHandle> {
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
