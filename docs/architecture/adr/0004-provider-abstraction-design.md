# ADR 0004 — Provider-abstraction layer with capability manifests, config-driven routing

## Status
Accepted

## Context
VELOCITY depends on a roster of video, image, TTS, and transcription vendors (Kling, Veo, Seedance, MiniMax, Seedream, WhisperX and others) that change faster than the product does. The build script's own reference point: Sora 2's consumer app closed 26 April 2026 and its API shut down 24 September 2026 — a three-week runway from spec to shutdown at the time this document was written. Any code path that calls a specific vendor SDK directly from business logic makes every future vendor change a multi-file refactor under time pressure.

## Decision
Every generation vendor sits behind a shared interface (`packages/providers/src/types.ts`) with a **capability manifest**, not just a method signature:

```ts
interface VideoProvider {
  id: string
  capabilities: {
    maxDurationSec: number; resolutions: string[]; nativeAudio: boolean
    lipSync: boolean; imageToVideo: boolean
    watermark: 'none' | 'model' | 'forced'
    commercialUse: boolean; costPerSecond: number
  }
  generate(input: VideoJobInput): Promise<ProviderJobHandle>
  poll(handle: ProviderJobHandle): Promise<ProviderJobStatus>
}
```

Identical shapes for `ImageProvider`, `TTSProvider`, `TranscriptionProvider` (`packages/providers`) and `TextProvider` (`packages/text-engine`, ADR 0005).

A **router** (not business logic) selects the adapter for each job from: capability match against the job's requirements, cost ceiling, current latency/health, workspace tier, and circuit-breaker state, with a configured fallback chain on failure. **Adapter registration and routing weights live in config, not in code** — enabling/disabling a provider or shifting traffic away from a degraded one must not require a deploy (this is also why STEP 18 specifies a per-model kill switch taking effect within 60 seconds).

STEP 1 establishes only the interface shapes and the folder structure (`packages/providers`, `packages/text-engine`) — no working adapters. Adapters are built per-provider in STEP 8 (video/image/TTS/transcription) and STEP 8B (text), each via the `provider-adapter` command, which requires either verified documentation or an explicitly-flagged fixture-backed implementation — never an invented contract.

## Consequences
- New provider = new adapter file + a capability-manifest entry + a config change, not a refactor of the render pipeline or the text engine.
- The router's cost-ceiling and capability-match logic becomes a place worth testing directly (fixture-backed, per the `provider-adapter` command), since it's the single point where a bad routing decision could silently pick an over-budget or non-compliant provider (e.g. one without a commercial-use licence for the customer's content).
- This ADR is the direct ancestor of GATE 8B's requirement that the same `TextPlan` schema drive both the Anthropic and OpenAI adapters — one schema, two adapters, is this pattern applied to the text case (ADR 0005).
