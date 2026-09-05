/**
 * Provider-abstraction interfaces (ADR 0004). Shapes only in STEP 1 — no
 * adapters implement these yet. Every generation vendor (video, image, TTS,
 * transcription) sits behind one of these, selected by ProviderRouter from
 * config, never hard-coded into business logic.
 */

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
}

interface BaseCapabilities {
  commercialUse: boolean;
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
  generate(input: VideoJobInput): Promise<ProviderJobHandle>;
  poll(handle: ProviderJobHandle): Promise<ProviderJobStatus>;
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
  generate(input: ImageJobInput): Promise<ProviderJobHandle>;
  poll(handle: ProviderJobHandle): Promise<ProviderJobStatus>;
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
  generate(input: TTSJobInput): Promise<ProviderJobHandle>;
  poll(handle: ProviderJobHandle): Promise<ProviderJobStatus>;
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
  transcribe(input: TranscriptionJobInput): Promise<ProviderJobHandle>;
  poll(handle: ProviderJobHandle): Promise<
    ProviderJobStatus & { words?: WordTiming[] }
  >;
}
