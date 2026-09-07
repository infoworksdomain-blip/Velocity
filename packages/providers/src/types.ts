/**
 * Provider-abstraction interfaces (ADR 0004). Every generation vendor
 * (video, image, TTS, transcription, and — as of STEP 8B — text) sits
 * behind one of these, selected by the router from config, never
 * hard-coded into business logic. TextProvider itself is defined in
 * @velocity/text-engine (its home since STEP 1, ADR 0005) and re-exported
 * here as part of AnyProvider so the one router serves all five kinds.
 */
import type { TextProvider } from "@velocity/text-engine";

export type WatermarkPolicy = "none" | "model" | "forced";

export interface ProviderJobHandle {
  providerId: string;
  externalJobId: string;
}

export type ProviderJobState = "queued" | "processing" | "succeeded" | "failed";

export interface ProviderJobStatus {
  state: ProviderJobState;
  outputUrl?: string;
  errorMessage?: string;
  costUsd: number;
  /**
   * The vendor's own reported cost for this job, when the vendor's API
   * exposes one — distinct from `costUsd` (the adapter's own estimate).
   * This is GATE 8's reconciliation source: usage_events should agree with
   * this figure to within 1%. Absent for vendors that don't report cost
   * per-job (reconciliation then falls back to the estimate).
   */
  providerReportedCostUsd?: number;
}

interface BaseCapabilities {
  commercialUse: boolean;
  /** Plan tiers this provider is available to, e.g. ["growth", "pro"]. Never hard-coded into routing logic — read by the router from config (ADR 0004). */
  tiers: string[];
}

export interface VideoJobInput {
  prompt: string;
  referenceImageUrl?: string;
  durationSec: number;
  resolution: string;
}

export interface VideoProvider {
  id: string;
  capabilities: BaseCapabilities & {
    maxDurationSec: number;
    resolutions: string[];
    nativeAudio: boolean;
    lipSync: boolean;
    imageToVideo: boolean;
    watermark: WatermarkPolicy;
    costPerSecond: number;
  };
  estimateCost(input: VideoJobInput): number;
  generate(input: VideoJobInput): Promise<ProviderJobHandle>;
  poll(handle: ProviderJobHandle): Promise<ProviderJobStatus>;
  cancel?(handle: ProviderJobHandle): Promise<void>;
}

export interface ImageJobInput {
  prompt: string;
  referenceImageUrl?: string;
  count: number;
}

export interface ImageProvider {
  id: string;
  capabilities: BaseCapabilities & {
    watermark: WatermarkPolicy;
    costPerImage: number;
  };
  estimateCost(input: ImageJobInput): number;
  generate(input: ImageJobInput): Promise<ProviderJobHandle>;
  poll(handle: ProviderJobHandle): Promise<ProviderJobStatus>;
  cancel?(handle: ProviderJobHandle): Promise<void>;
}

export interface TTSJobInput {
  script: string;
  voiceId: string;
}

export interface TTSProvider {
  id: string;
  capabilities: BaseCapabilities & {
    costPerCharacter: number;
  };
  estimateCost(input: TTSJobInput): number;
  generate(input: TTSJobInput): Promise<ProviderJobHandle>;
  poll(handle: ProviderJobHandle): Promise<ProviderJobStatus>;
  cancel?(handle: ProviderJobHandle): Promise<void>;
}

export interface TranscriptionJobInput {
  audioUrl: string;
  language?: string;
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptionProvider {
  id: string;
  capabilities: BaseCapabilities & {
    costPerSecond: number;
  };
  estimateCost(input: TranscriptionJobInput): number;
  transcribe(input: TranscriptionJobInput): Promise<ProviderJobHandle>;
  poll(handle: ProviderJobHandle): Promise<
    ProviderJobStatus & { words?: WordTiming[] }
  >;
  cancel?(handle: ProviderJobHandle): Promise<void>;
}

export type AnyProvider = VideoProvider | ImageProvider | TTSProvider | TranscriptionProvider | TextProvider;
