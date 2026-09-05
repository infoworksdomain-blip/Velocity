---
description: Scaffold a new provider adapter with a fixture-backed test
argument-hint: <provider-name> <provider-kind: video|image|tts|transcription|text>
---

Scaffold a new provider adapter for `{{provider-name}}` of kind `{{provider-kind}}`, conforming to the shared interface in `packages/providers/types.ts` (or `packages/text-engine/types.ts` for kind `text`).

Steps:
1. Confirm the provider's actual request/response shape against its official documentation. Do not invent field names or status semantics — if you're not certain, stop and ask, or build against a recorded fixture and flag it as unverified in a code comment and in your summary.
2. Implement the adapter: capability manifest (max duration/resolution, native audio, lip-sync, watermark policy, commercial licence, cost per unit — as applicable to the provider kind), `generate`/`poll` (or `generateStructured` for text), error mapping to the shared error taxonomy, and metering into `usage_events` before the response returns (C5 — no un-metered path).
3. Register the adapter in the router config (capability match, cost ceiling, health/circuit-breaker state) — do not hard-code it as a special case anywhere else.
4. Write a fixture-backed test: record a real (or documented-shape) request/response pair under `__fixtures__/`, and assert the adapter parses it correctly, including failure and rate-limit responses.
5. If this provider replaces or sits alongside an existing one for the same job, confirm the fallback chain still resolves correctly.

Stop and report what you built, what's fixture-backed vs. live-verified, and any open questions about the provider's contract.
