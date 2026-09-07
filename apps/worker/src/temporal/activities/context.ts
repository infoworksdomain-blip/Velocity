import {
  createElevenLabsStubProvider,
  createKlingStubProvider,
  createMinimaxStubProvider,
  createSeedanceStubProvider,
  createSeedreamStubProvider,
  createVeoStubProvider,
  createWanStubProvider,
  createWhisperXStubProvider,
  DeterministicEmbeddingProvider,
  FileProviderConfigSource,
  ProviderRegistry,
  CircuitBreaker,
  InMemoryBreakerStore,
} from "@velocity/providers";
import { withWorkspace } from "@velocity/db";
import { StubCompositor } from "../../composition/stub.compositor.js";
import { PassThroughNormaliser } from "../../composition/loudness.js";
import { InMemoryBlobStore } from "../../storage/local.blob-store.js";
import type { BlobStore } from "../../storage/blob-store.js";
import type { Compositor } from "../../composition/compositor.js";
import type { WorkspaceDb } from "./step-ledger.js";
import type { LoudnessNormaliser } from "../../composition/loudness.js";

/**
 * Module-level singleton wiring for every render activity (STEP 8.4).
 * Temporal activity functions must take JSON-serialisable arguments, so
 * dependencies are wired here via closures/singletons rather than passed
 * as activity parameters — the same pattern `getAdminDb()` uses elsewhere
 * in this codebase, applied to the activity layer.
 */

let registry: ProviderRegistry | undefined;
export function getProviderRegistry(): ProviderRegistry {
  if (registry) return registry;
  registry = new ProviderRegistry(new FileProviderConfigSource());
  registry.register("video", "kling-3.0", (entry) => createKlingStubProvider(entry.tiers));
  registry.register("video", "veo-3.1", (entry) => createVeoStubProvider(entry.tiers));
  registry.register("video", "seedance-2.5", (entry) => createSeedanceStubProvider(entry.tiers));
  registry.register("video", "minimax-h3", (entry) => createMinimaxStubProvider(entry.tiers));
  registry.register("video", "wan-2.2", (entry) => createWanStubProvider(entry.tiers));
  registry.register("image", "seedream-5.0", (entry) => createSeedreamStubProvider(entry.tiers));
  registry.register("tts", "elevenlabs", (entry) => createElevenLabsStubProvider(entry.tiers));
  registry.register("transcription", "whisperx", (entry) => createWhisperXStubProvider(entry.tiers));
  return registry;
}

let breaker: CircuitBreaker | undefined;
export function getCircuitBreaker(): CircuitBreaker {
  breaker ??= new CircuitBreaker(new InMemoryBreakerStore());
  return breaker;
}

let embedder: DeterministicEmbeddingProvider | undefined;
export function getEmbedder(): DeterministicEmbeddingProvider {
  embedder ??= new DeterministicEmbeddingProvider();
  return embedder;
}

let blobStore: BlobStore | undefined;
export function getBlobStore(): BlobStore {
  blobStore ??= new InMemoryBlobStore();
  return blobStore;
}

let compositor: Compositor | undefined;
export function getCompositor(): Compositor {
  compositor ??= new StubCompositor(getBlobStore());
  return compositor;
}

let loudnessNormaliser: LoudnessNormaliser | undefined;
export function getLoudnessNormaliser(): LoudnessNormaliser {
  loudnessNormaliser ??= new PassThroughNormaliser();
  return loudnessNormaliser;
}

type RunInWorkspaceTx = <T>(workspaceId: string, fn: (db: WorkspaceDb) => Promise<T>) => Promise<T>;

const defaultRunInWorkspaceTx: RunInWorkspaceTx = (workspaceId, fn) => withWorkspace(workspaceId, fn);
let runInWorkspaceTxImpl: RunInWorkspaceTx = defaultRunInWorkspaceTx;

/**
 * Swappable rather than hardcoded to the production `withWorkspace` (real
 * network Postgres) — activities are registered as plain functions for
 * Temporal, so this module-singleton pattern (same shape as `getAdminDb()`
 * elsewhere in this codebase) is how tests substitute a PGlite-backed
 * implementation (see apps/worker/src/__tests__/helpers) without any
 * test-only branching inside the activities themselves.
 */
export function runInWorkspaceTx<T>(workspaceId: string, fn: (db: WorkspaceDb) => Promise<T>): Promise<T> {
  return runInWorkspaceTxImpl(workspaceId, fn);
}

export function setRunInWorkspaceTxForTests(impl: RunInWorkspaceTx): void {
  runInWorkspaceTxImpl = impl;
}

/** Test-only: resets every singleton so tests don't leak state (e.g. breaker state, registry config, the PGlite db swap) into each other. */
export function resetActivityContextForTests(): void {
  registry = undefined;
  breaker = undefined;
  embedder = undefined;
  blobStore = undefined;
  compositor = undefined;
  loudnessNormaliser = undefined;
  runInWorkspaceTxImpl = defaultRunInWorkspaceTx;
}
