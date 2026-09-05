# C4 — Component Diagram: Provider Router & Text Engine

One level down inside `apps/worker`, `packages/providers`, and `packages/text-engine` — the part of the system most exposed to vendor churn (Sora 2's API shut down 24 September 2026 while this spec was being written).

```mermaid
C4Component
title VELOCITY — Provider Router & Text-Engine Components

Container_Boundary(worker, "apps/worker") {
  Component(renderWorkflow, "Render workflow", "Temporal workflow", "resolveAssets → generateShots → generateVO → align → composeText → compose → normalise → provenance → qc → publishReady")
}

Container_Boundary(providersPkg, "packages/providers") {
  Component(router, "ProviderRouter", "TS module", "Selects an adapter per job: capability match, cost ceiling, latency/health, workspace tier, circuit-breaker state")
  Component(videoAdapters, "VideoProvider adapters", "Kling / Veo / Seedance / MiniMax", "Implement generate()/poll() against the shared interface")
  Component(imageAdapters, "ImageProvider adapters", "Seedream and others")
  Component(ttsAdapters, "TTSProvider adapters", "ElevenLabs or equivalent")
  Component(transcriptionAdapters, "TranscriptionProvider adapters", "WhisperX")
}

Container_Boundary(textEnginePkg, "packages/text-engine") {
  Component(textRouter, "Text routing policy", "Config, not code", "Per job: Anthropic default, OpenAI fallback, or cheapest-healthy for bulk fan-out")
  Component(anthropicAdapter, "Anthropic adapter", "Messages API", "Forced tool-use; input_schema = TextPlan JSON Schema")
  Component(openaiAdapter, "OpenAI adapter", "Responses API", "Strict JSON-schema response format; same schema object")
  Component(validation, "Validation & repair loop", "Zod + repair calls", "Schema → length/fit → brand-rule → safety → duplicate checks")
}

ComponentDb(usageEvents, "usage_events", "Postgres table", "Every model call — video, image, text — metered here before the response returns (C5)")

Rel(renderWorkflow, router, "generateShots / generateVO activities")
Rel(router, videoAdapters, "capability-matched selection")
Rel(router, imageAdapters, "capability-matched selection")
Rel(router, ttsAdapters, "capability-matched selection")
Rel(renderWorkflow, transcriptionAdapters, "align activity (WhisperX)")
Rel(renderWorkflow, textRouter, "composeText activity requests a TextPlan")
Rel(textRouter, anthropicAdapter, "default")
Rel(textRouter, openaiAdapter, "fallback")
Rel(anthropicAdapter, validation, "raw tool_use output")
Rel(openaiAdapter, validation, "raw structured output")
Rel(validation, renderWorkflow, "validated TextPlan")
Rel(videoAdapters, usageEvents, "meter cost")
Rel(imageAdapters, usageEvents, "meter cost")
Rel(anthropicAdapter, usageEvents, "meter cost")
Rel(openaiAdapter, usageEvents, "meter cost")
```

**Why this is drawn separately:** the `TextPlan` boundary between `textRouter`/`validation` and the render workflow is the seam that makes hook A/B testing cheap (STEP 8B.6) — a hook change re-enters at `composeText` and never touches `generateShots`/`generateVO` again, reusing the cached video track.
