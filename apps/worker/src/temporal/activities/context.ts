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
  type ProviderConfigSource,
} from "@velocity/providers";
import { AnthropicTextProvider, OpenAITextProvider, createStubTextProvider } from "@velocity/text-engine";
import { createAdminDb, createKmsProvider, withWorkspace, type KmsProvider } from "@velocity/db";
import { StubCompositor } from "../../composition/stub.compositor.js";
import { RemotionLambdaCompositor, type RemotionLambdaConfig } from "../../composition/remotion-lambda.compositor.js";
import { PassThroughNormaliser } from "../../composition/loudness.js";
import { InMemoryBlobStore } from "../../storage/local.blob-store.js";
import type { BlobStore } from "../../storage/blob-store.js";
import type { Compositor } from "../../composition/compositor.js";
import type { WorkspaceDb } from "./step-ledger.js";
import type { LoudnessNormaliser } from "../../composition/loudness.js";
import { DbProviderConfigSource, type AdminLikeDb } from "./db-provider-config-source.js";

/**
 * Module-level singleton wiring for every render activity (STEP 8.4).
 * Temporal activity functions must take JSON-serialisable arguments, so
 * dependencies are wired here via closures/singletons rather than passed
 * as activity parameters — the same pattern `getAdminDb()` uses elsewhere
 * in this codebase, applied to the activity layer.
 */

// STEP 18: the file source stays the source of truth for which providers
// exist and their credentials; DbProviderConfigSource overlays the
// DB-backed admin-controllable fields (enabled/weight/tiers/adapter/
// breaker) on top. A 30s TTL (ProviderRegistry's default) means an
// admin's kill-switch flip reaches every worker process within GATE 18's
// literal 60-second bound, with no restart. Swappable (not reset by
// resetActivityContextForTests — deliberately sticky for a whole test
// file, unlike the per-request runInWorkspaceTxImpl override below) so
// render-workflow tests that have nothing to do with STEP 18 can point
// getProviderRegistry() at a plain FileProviderConfigSource instead of
// requiring a live admin DB connection — see
// apps/worker/src/__tests__/helpers/provider-config-env.ts.
type ProviderConfigSourceFactory = () => ProviderConfigSource;
const defaultProviderConfigSourceFactory: ProviderConfigSourceFactory = () => new DbProviderConfigSource(new FileProviderConfigSource());
let providerConfigSourceFactoryImpl: ProviderConfigSourceFactory = defaultProviderConfigSourceFactory;

export function setProviderConfigSourceForTests(factory: ProviderConfigSourceFactory): void {
  providerConfigSourceFactoryImpl = factory;
}

let registry: ProviderRegistry | undefined;
export function getProviderRegistry(): ProviderRegistry {
  if (registry) return registry;
  registry = new ProviderRegistry(providerConfigSourceFactoryImpl());
  registry.register("video", "kling-3.0", (entry) => createKlingStubProvider(entry.tiers));
  registry.register("video", "veo-3.1", (entry) => createVeoStubProvider(entry.tiers));
  registry.register("video", "seedance-2.5", (entry) => createSeedanceStubProvider(entry.tiers));
  registry.register("video", "minimax-h3", (entry) => createMinimaxStubProvider(entry.tiers));
  registry.register("video", "wan-2.2", (entry) => createWanStubProvider(entry.tiers));
  registry.register("image", "seedream-5.0", (entry) => createSeedreamStubProvider(entry.tiers));
  registry.register("tts", "elevenlabs", (entry) => createElevenLabsStubProvider(entry.tiers));
  registry.register("transcription", "whisperx", (entry) => createWhisperXStubProvider(entry.tiers));
  // Real adapters (STEP 8B) — self-adapting on credential presence, unlike
  // the stub-only video/image/tts/transcription adapters above: with a
  // funded API key configured, the real Anthropic/OpenAI SDK call runs;
  // with none (this sandbox, or any env that hasn't funded a key yet), the
  // SAME factory transparently falls back to a deterministic stub so the
  // render pipeline stays runnable and testable either way — see
  // docs/steps/STEP-08B.md.
  registry.register("text", "anthropic", (entry) =>
    entry.credentials.apiKey ? new AnthropicTextProvider("claude-sonnet-4-6", entry.credentials.apiKey, entry.tiers) : createStubTextProvider("anthropic", entry.tiers),
  );
  registry.register("text", "openai", (entry) =>
    entry.credentials.apiKey ? new OpenAITextProvider("gpt-4.1", entry.credentials.apiKey, entry.tiers) : createStubTextProvider("openai", entry.tiers),
  );
  return registry;
}

// STEP 18: platform-root reads with no workspace context (e.g. the
// feature_flags row for a global publish pause) — same role as apps/web's
// getAdminDb(), needed here because this activity layer has no HTTP
// request to attach a workspace-scoped db to. Sticky across a test file
// (not reset by resetActivityContextForTests), the same reasoning as the
// provider-config-source factory above.
let adminDbInstance: AdminLikeDb | undefined;
export function getAdminDb(): AdminLikeDb {
  adminDbInstance ??= createAdminDb();
  return adminDbInstance;
}

export function setAdminDbForTests(db: AdminLikeDb): void {
  adminDbInstance = db;
}

let breaker: CircuitBreaker | undefined;
export function getCircuitBreaker(): CircuitBreaker {
  breaker ??= new CircuitBreaker(new InMemoryBreakerStore());
  return breaker;
}

let kmsProvider: KmsProvider | undefined;
/** STEP 12: decrypts `platform_credentials.encrypted_payload` in the publish pipeline's platformInit activity — same env-driven `createKmsProvider()` factory apps/web's social-service.ts already uses for the same payload shape. */
export function getKmsProvider(): KmsProvider {
  kmsProvider ??= createKmsProvider();
  return kmsProvider;
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

/**
 * Post-STEP-22 audit remediation: same "self-adapting on credential
 * presence" pattern the text-provider registrations above already use —
 * with all three REMOTION_AWS_* env vars configured (set by a real
 * apps/render `deploy:lambda` run), this activates the real
 * RemotionLambdaCompositor; absent any of them, the render pipeline stays
 * on the StubCompositor default exactly as before, no restart-required
 * config change needed to keep this sandbox (and any environment without
 * a deployed Lambda function) working.
 */
export function readRemotionLambdaConfig(): RemotionLambdaConfig | null {
  const region = process.env.REMOTION_AWS_REGION;
  const functionName = process.env.REMOTION_AWS_LAMBDA_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_SITE_URL;
  if (!region || !functionName || !serveUrl) return null;
  return { region: region as RemotionLambdaConfig["region"], functionName, serveUrl, compositionId: "VerticalVideo" };
}

let compositor: Compositor | undefined;
export function getCompositor(): Compositor {
  if (compositor) return compositor;
  const lambdaConfig = readRemotionLambdaConfig();
  compositor = lambdaConfig ? new RemotionLambdaCompositor(getBlobStore(), lambdaConfig) : new StubCompositor(getBlobStore());
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
  kmsProvider = undefined;
  embedder = undefined;
  blobStore = undefined;
  compositor = undefined;
  loudnessNormaliser = undefined;
  runInWorkspaceTxImpl = defaultRunInWorkspaceTx;
}
