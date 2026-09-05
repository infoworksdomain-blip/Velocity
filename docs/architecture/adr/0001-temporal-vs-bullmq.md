# ADR 0001 — Temporal for render/publish workflows, BullMQ for short jobs

## Status
Accepted

## Context
VELOCITY has two very different classes of asynchronous work. One class is short, cheap, and tolerant of loss on a crash: sending a notification, syncing a quota counter, refreshing a cache. The other class is exactly the opposite: the render pipeline (`resolveAssets → generateShots → generateVO → align → composeText → compose → normalise → provenance → qc → publishReady`) and the publish pipeline (`preflight → mediaStage → platformInit → upload → poll → confirm → record`) run for anywhere from 30 seconds to several minutes, call multiple paid third-party vendors per run, and must never silently duplicate spend or a public post if a worker dies mid-job.

A single queue technology chosen for one class fails the other: BullMQ alone makes multi-step, multi-vendor, restart-safe orchestration something the application has to hand-roll (checkpointing, idempotency, compensation); Temporal alone for every trivial job is unnecessary operational weight.

## Decision
Use **both**, with an explicit boundary rule:

- **BullMQ** (Redis-backed) for jobs that are short, stateless, and safe to lose or simply retry from scratch on failure: notifications, quota-counter syncs, webhook delivery, cache warms.
- **Temporal** for anything that is multi-step, multi-minute, calls a paid third-party vendor, or must survive a worker restart without duplicating spend or a publish action: the render pipeline (STEP 8) and the publish pipeline (STEP 12).

**The boundary test for a new job type:** if losing partial progress means only "the user waits a bit longer for a retry," it's BullMQ. If losing partial progress means "we pay for the same video generation twice" or "we might post the same content twice," it's Temporal.

Each Temporal activity in the render/publish workflows is idempotent and independently retryable with its own timeout, so a killed worker resumes without re-doing (and re-paying for) completed steps — e.g. if `compose` fails after four shot generations, those shots are cached and reused on retry, not regenerated.

## Consequences
- Two pieces of async infrastructure to run and monitor (Temporal server + Redis), rather than one. `.vscode/tasks.json` and the devcontainer both provision Temporal's dev server for this reason.
- Any engineer adding a new background job must classify it against the boundary rule above before picking a queue — this is called out explicitly in `CLAUDE.md` and the `plan-step` command.
- GATE 8 and GATE 12's chaos tests (kill a worker mid-render / mid-publish, assert no duplicate spend or duplicate post) are the mechanical proof that this boundary is implemented correctly, not just documented.
