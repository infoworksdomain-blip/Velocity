import { createHash } from "node:crypto";
import type { ProviderJobHandle, ProviderJobState } from "../../types.js";

/**
 * Shared in-memory job simulator for every stub adapter (STEP 8 — real
 * vendor adapters for Kling/Veo/Seedance/MiniMax/Seedream/ElevenLabs/
 * WhisperX need real API keys, a credential decision, not fabricated
 * here — see docs/steps/STEP-08.md). Each stub adapter file is flagged
 * with the provider-adapter command's unverified-fixture marker.
 *
 * `externalJobId` is `sha256(providerId + canonicalJson(input))` — the
 * SAME input always produces the SAME job id. This makes the stub itself
 * idempotent, independent of the render-step ledger in apps/worker: even
 * if the ledger's own dedup logic had a bug, calling `generate()` twice
 * with identical input resolves to the same simulated job rather than
 * spawning a second one, giving the "killed worker doesn't double-spend"
 * property a second, independent detector.
 */

interface SimulatedJob {
  state: ProviderJobState;
  createdAt: number;
  processingMs: number;
  outputUrl: string;
  costUsd: number;
  providerReportedCostUsd: number;
  /** Injected failure — deterministic per job id, not random, so a test can reproduce it. */
  shouldFail: boolean;
  generateCallCount: number;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function computeExternalJobId(providerId: string, input: unknown): string {
  return createHash("sha256").update(providerId).update(canonicalJson(input)).digest("hex").slice(0, 32);
}

export interface DeterministicJobStoreOptions {
  processingMs?: number;
  costUsd: (input: unknown) => number;
  /** Fraction (0-1) of job ids that deterministically simulate a provider-side failure — for chaos/concurrency testing, never randomised per-call. */
  injectedFailureRate?: number;
}

export class DeterministicJobStore {
  private readonly jobs = new Map<string, SimulatedJob>();

  constructor(
    private readonly providerId: string,
    private readonly options: DeterministicJobStoreOptions,
  ) {}

  generate(input: unknown): ProviderJobHandle {
    const externalJobId = computeExternalJobId(this.providerId, input);
    const existing = this.jobs.get(externalJobId);
    if (existing) {
      existing.generateCallCount += 1;
      return { providerId: this.providerId, externalJobId };
    }

    const costUsd = this.options.costUsd(input);
    // Deterministic pseudo-random derived from the job id, not Math.random() — reproducible across runs.
    const hashByte = parseInt(externalJobId.slice(0, 2), 16);
    const failureRate = this.options.injectedFailureRate ?? 0;
    const shouldFail = hashByte / 255 < failureRate;

    this.jobs.set(externalJobId, {
      state: "queued",
      createdAt: Date.now(),
      processingMs: this.options.processingMs ?? 50,
      outputUrl: `stub://${this.providerId}/${externalJobId}`,
      costUsd,
      providerReportedCostUsd: costUsd,
      shouldFail,
      generateCallCount: 1,
    });
    return { providerId: this.providerId, externalJobId };
  }

  /** How many times `generate()` was called for this job id — the metric a test asserts stays at 1 across a simulated worker crash+resume. */
  generateCallCountFor(externalJobId: string): number {
    return this.jobs.get(externalJobId)?.generateCallCount ?? 0;
  }

  poll(externalJobId: string): { state: ProviderJobState; outputUrl?: string; errorMessage?: string; costUsd: number; providerReportedCostUsd?: number } {
    const job = this.jobs.get(externalJobId);
    if (!job) throw new Error(`Unknown job id ${externalJobId} — generate() must be called before poll()`);

    const elapsedMs = Date.now() - job.createdAt;
    if (elapsedMs < job.processingMs) {
      job.state = "processing";
      return { state: "processing", costUsd: 0 };
    }

    if (job.shouldFail) {
      job.state = "failed";
      return { state: "failed", errorMessage: "simulated provider-side failure (injected, deterministic)", costUsd: 0 };
    }

    job.state = "succeeded";
    return {
      state: "succeeded",
      outputUrl: job.outputUrl,
      costUsd: job.costUsd,
      providerReportedCostUsd: job.providerReportedCostUsd,
    };
  }

  cancel(externalJobId: string): void {
    const job = this.jobs.get(externalJobId);
    if (job && job.state !== "succeeded") job.state = "failed";
  }
}
