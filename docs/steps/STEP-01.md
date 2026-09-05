# STEP 1 — Architecture

Status: **PLAN — awaiting approval. No code written yet.**

## Goal (from `velocity-build-script.md`)

Deliver `/docs/architecture/` with C4 diagrams, an ADR folder, a repo skeleton, and CI — establishing the pnpm/Turborepo monorepo shape, the fixed domain-model vocabulary, and the architectural decisions that every later step depends on.

## 1. Domain model (write first — prose, in `/docs/architecture/domain-model.md`)

One paragraph per entity, covering: what it represents, its lifecycle states (if any), which other entities own or reference it, and which constraint from C1–C8 applies to it directly.

`Organisation` → `Workspace` → `BrandProfile` (versioned) → `Angle` → `TrendBlueprint` → `Persona` → `ContentConcept` → `TextPlan` → `ContentItem` → `Render` → `MediaAsset` → `CalendarSlot` → `Publication` → `SocialAccount` → `MetricSnapshot`.

This doc is the vocabulary contract for every later step — STEP 2's schema, STEP 8/8B's pipeline, and the STEP 16 public API all reuse these exact names. No renaming after this step without a follow-up ADR.

## 2. C4 diagrams (Mermaid, in `/docs/architecture/`)

- **`c4-context.md`** — VELOCITY as a system, its actors (Individual user, Business user, Agency operator, Client-portal viewer), and the external systems it talks to: TikTok Content Posting API, Instagram Content Publishing API, YouTube Data API, Anthropic, OpenAI, video/image model vendors (Kling, Veo, Seedance, MiniMax, Seedream), Stripe, Cloudflare R2.
- **`c4-container.md`** — the monorepo's runtime containers: `apps/web` (Next.js, tRPC + REST `/v1`), `apps/worker` (BullMQ short jobs + Temporal workers), `apps/render` (Remotion/Lambda composition), Postgres (+pgvector, RLS), Redis, Temporal server, R2/CDN.
- **`c4-component.md`** — one level down inside `apps/web` and `packages/providers`/`packages/text-engine`, showing the provider-router pattern and where `TextPlan` sits between the text-engine and the Remotion render pipeline.

## 3. ADRs (in `/docs/architecture/adr/`, one file each, standard ADR format: Context / Decision / Consequences)

1. **`0001-temporal-vs-bullmq.md`** — Temporal for render/publish workflows (multi-minute, multi-vendor, must survive worker restarts with idempotent/retryable activities); BullMQ retained for short, stateless jobs (notifications, quick sync tasks). Not an either/or — document the boundary rule for "which queue does a new job go in."
2. **`0002-remotion-vs-ffmpeg.md`** — Remotion (React → MP4) as the compositor of record; ffmpeg scoped to transcode and loudness normalisation only, never composition. Document the fallback story if Remotion/Lambda has an outage.
3. **`0003-rls-vs-schema-per-tenant.md`** — Postgres RLS with `workspace_id` + `current_setting('app.workspace_id')` on every tenant table, over schema-per-tenant. Document the connection-pooling implication (session variable must be set per request/transaction, not per connection) since this is the most common way RLS isolation silently breaks under pooling.
4. **`0004-provider-abstraction-design.md`** — the `VideoProvider`/`ImageProvider`/`TTSProvider`/`TranscriptionProvider` interface shape from §8.1, the router's selection criteria (capability match, cost ceiling, latency/health, workspace tier, circuit-breaker state), and the config-driven (not code-driven) registration rule — this is the ADR the Sora-2-shutdown example in the script exists to justify.
5. **`0005-llm-structured-output-strategy.md`** — one JSON Schema definition serving both the Anthropic adapter (forced tool-use via `tool_choice`) and the OpenAI adapter (strict JSON-schema response format), converted by a shared adapter layer. Document why two schemas is the failure mode this avoids.

## 4. Threat model sketch (`/docs/architecture/threat-model.md`)

Scoped to four areas per the script, each with the concrete attack scenario and the mitigation it drives into later steps:
- **Tenant isolation** — cross-workspace data leakage via a missing RLS policy or a query that forgets `workspace_id`; drives STEP 2's generated table-enumeration test and STEP 20's adversarial suite.
- **OAuth token custody** — `platform_credentials` encryption at rest, no logging/no API return path, rotation and revocation; drives STEP 11.
- **SSRF on user-supplied URLs** — the brand-ingest crawler fetches arbitrary customer-supplied URLs; drives STEP 6's private-IP blocking, DNS-rebind re-check after redirect, and egress-restricted fetcher network.
- **Prompt injection from scraped content** — untrusted page content reaching the brand-profile extractor and the text-engine; drives STEP 6 and STEP 8B's delimiter/ignore-instructions/schema-reject pattern.

## 5. Repo skeleton

pnpm + Turborepo monorepo:

```
velocity/
  apps/
    web/          # Next.js 15 App Router, tRPC + REST /v1
    worker/        # BullMQ + Temporal workers
    render/        # Remotion composition service
  packages/
    db/            # Drizzle schema, migrations, RLS policies
    core/          # domain types, shared business logic
    providers/      # VideoProvider/ImageProvider/TTSProvider/TranscriptionProvider + router
    text-engine/    # TextProvider abstraction, TextPlan schema, Anthropic/OpenAI adapters
    contracts/      # Zod schemas shared between tRPC, REST, and OpenAPI generation
    ui/             # design-system components + tokens (Appendix A)
  docs/
    architecture/   # this step's diagrams, ADRs, threat model, domain model
    steps/          # STEP-NN.md plan docs
  pnpm-workspace.yaml
  turbo.json
  package.json
  .env.example
```

Each `apps/*` and `packages/*` gets a minimal `package.json`, `tsconfig.json` (extending a shared root config), and a placeholder entrypoint sufficient for `pnpm build` to succeed end-to-end — no business logic yet. `packages/ui/tokens/` gets the Appendix A CSS custom properties for real, since the token-audit CI check (GATE 7, but wired from the start) depends on nothing pre-existing outside that file.

## 6. CI

GitHub Actions (or equivalent) workflow running on every PR: `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm typecheck` → `pnpm lint` → `pnpm test`. This is what GATE 1's "`pnpm build` green on a clean clone" is checked against mechanically, not just locally.

## 7. GATE 1 — acceptance checks

| Check | Expected |
|---|---|
| C4 diagrams committed | `c4-context.md`, `c4-container.md`, `c4-component.md` present in `/docs/architecture/`, render as valid Mermaid |
| Domain model documented | `domain-model.md` covers all 15 entities with lifecycle + owning-entity + relevant constraint |
| `pnpm build` on a clean clone | Exits 0 from a fresh `pnpm install` with no local state |
| ADRs merged | All 5 ADRs present under `/docs/architecture/adr/`, each with Context/Decision/Consequences |
| Threat model sketch present | `threat-model.md` covers all 4 areas with scenario + mitigation + which later step owns the fix |
| CI green | The build/typecheck/lint/test workflow passes on the initial commit |

## What this step does NOT do

No database migrations (STEP 2), no auth (STEP 3), no actual provider implementations (STEP 8/8B) — `packages/providers` and `packages/text-engine` get their interface shapes and folder structure only, not working adapters. No application UI beyond what's needed to prove `pnpm build` succeeds.

## Next action

Waiting for approval of this plan before creating any of the above.
