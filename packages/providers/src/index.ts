/**
 * Deliberately does NOT re-export "./brand-intelligence/index.js" here —
 * a real production bug found in this build's own web app: that module
 * statically imports crawler.ts, which statically imports real
 * `playwright` at module top level. Since ES `export *` re-exports are
 * eager (the whole chain evaluates the moment ANYTHING is imported from
 * this barrel, regardless of which name is actually used), every consumer
 * of this package's root — including content-service.ts, which only
 * wanted the crawler-free `DeterministicEmbeddingProvider` below — was
 * transitively trying to load `playwright`, a package apps/web's
 * next.config.ts deliberately excludes from its serverless bundles
 * (it's a large native-binary dependency; launching real headless Chromium
 * isn't viable inside a typical Vercel function). Import the real crawler
 * from "@velocity/providers/brand-intelligence" instead — a real subpath
 * export (see package.json), not this root barrel — so pulling it in is
 * an explicit, deliberate choice by whichever caller actually needs it.
 */
export * from "./types.js";
export * from "./router.js";
export * from "./website-intelligence.js";
export * from "./concept-generation.js";
export * from "./embedding.js";
export * from "./adapters/shared/deterministic-job-store.js";
export * from "./adapters/video/kling.stub.js";
export * from "./adapters/video/veo.stub.js";
export * from "./adapters/video/seedance.stub.js";
export * from "./adapters/video/minimax.stub.js";
export * from "./adapters/video/wan.stub.js";
export * from "./adapters/image/seedream.stub.js";
export * from "./adapters/tts/elevenlabs.stub.js";
export * from "./adapters/transcription/whisperx.stub.js";
