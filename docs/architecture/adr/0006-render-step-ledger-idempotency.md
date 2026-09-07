# ADR 0006 — A content-addressed step ledger is the idempotency mechanism for the render pipeline

## Status
Accepted

## Context

GATE 8 requires that a killed worker mid-render resumes without duplicate spend. The render workflow (STEP 8.4) chains ten activities across multiple real vendor API calls (video/image generation, TTS, transcription), each of which can cost real money. Temporal guarantees an activity is *retried* on failure (worker crash, heartbeat timeout, transient error) — it does not by itself guarantee the retried activity won't repeat billable work, because the activity function's own body re-executes from the top on every attempt.

Three alternatives were considered:

1. **Rely on Temporal's own activity result caching.** Rejected: Temporal caches a *completed* activity's result for replay during workflow history reconstruction, but an activity that crashed mid-execution (after calling a vendor API, before recording success) has no completed result to cache — this is exactly the gap that causes duplicate spend.
2. **Provider-side idempotency keys.** Some vendors accept a client-supplied idempotency key and deduplicate on their end. Rejected as the *sole* mechanism: it's vendor-specific (not every vendor in the roster supports it), and this project's provider abstraction (ADR 0004) must not assume a capability only some adapters have.
3. **Event sourcing over the full activity history.** Rejected as overkill: replaying an event log to reconstruct "was this job already submitted" is more machinery than the problem needs, and duplicates state Temporal's own workflow history already tracks.

## Decision

A dedicated `render_steps` table is the source of truth for "has this exact unit of work already been done," independent of both Temporal's workflow history and any vendor-side deduplication:

- **`stepKey` is deterministic and content-addressed** — derived by hashing the step's own input (plus `regenerationRound`, so a QC-triggered regeneration produces a genuinely new key while a crash-retry with unchanged input reproduces the same key). A retried activity re-derives the identical key without needing to remember anything from its previous attempt.
- **`(render_id, step_key)` is a unique index** — the mechanical backstop against two concurrent attempts both believing they're the first to claim a step.
- **The critical ordering**: after calling a provider's `generate()`, the resulting `provider_id`/`external_job_id` is persisted in its own short, committed database write — *before* the first `poll()`. A worker killed while polling leaves a `render_steps` row already `running` with a job id attached; the next attempt (this or another worker) finds that row, resumes polling the *same* job, and never calls `generate()` again.
- **No DB transaction spans the poll loop.** A real vendor render can take minutes; holding a Postgres transaction open for that long is a real anti-pattern (idle-in-transaction, held locks). `withStep` (`apps/worker/src/temporal/activities/step-ledger.ts`) does three short, separate round-trips — claim/resume, poll (no transaction), commit — never one long-lived one.
- **Metering (C5) is folded into the same commit as marking the step succeeded**, guarded by `WHERE state <> 'succeeded'` so a concurrent duplicate commit attempt reads back the winner's result instead of double-billing.

## Consequences

- A new activity that talks to a provider must use `withStep` — bypassing it reintroduces the exact duplicate-spend risk this ADR exists to close.
- The ledger is real audit trail, not just a cache: `render_steps` rows are never deleted, even on compensation (a workflow-level failure cancels outstanding provider jobs and marks the row `failed`, it does not remove it) — GATE 8's cost reconciliation depends on every spend having a permanent record.
- This pattern generalises to the publish workflow (STEP 12), which has the identical "retryable steps against a vendor whose response can't be un-happened" shape.
- Verified directly (not just designed): `apps/worker/src/__tests__/render.workflow.idempotency.test.ts` forces a provider `poll()` to fail once mid-flight, confirming Temporal's automatic retry resumes the same job (`generate()` called exactly once) rather than resubmitting — against a real embedded Postgres (PGlite) and a real Temporal test environment, not mocks.
