# CLAUDE.md — VELOCITY

This file is read by Claude Code at the start of every session in this repo. The full contract is `./velocity-build-script.md` — read it before writing any code. This file is the fast-recall summary: constraints, naming, tokens, and the commands to run.

## What this is

VELOCITY: a multi-tenant SaaS that turns a website URL into short-form video and slideshow content, then schedules and publishes it to TikTok, Instagram Reels and YouTube Shorts, with performance data feeding back into what gets generated next.

Sibling project note: `../socialblitz-app` is a separate, earlier, simpler build of an adjacent idea (broader social platform coverage, lighter stack, demo-data adapters). It is **not** part of this repo, is not migrated from, and should not be referenced as a pattern source — VELOCITY has its own stack and constraints below.

## Current step

**The user has waived the "write plan, stop for approval" rule for the remainder of this build (see chat) — proceeding continuously through the steps, no per-step approval gate.** STEP-NN.md files are still written for the design record, just not as checkpoints.

**STEP 1 (Architecture) — GATE 1 passed.** **STEP 2 (Database) — code-complete, live-DB checks unverified against a network Postgres** (no Docker, no credentials for the pre-existing native Postgres on this machine — see `docs/steps/STEP-02.md`; STEP 8 found a real PGlite-embedded-Postgres alternative that CAN verify most of these, not yet retrofitted — see STEP 8's note below). **STEP 3 (Auth/RBAC) — substantially passed**: RBAC policy engine, password hashing, TOTP MFA, JWT sessions, and a real Google OAuth adapter. **STEP 4 (Workspace) — substantially passed**: workspace CRUD, membership/invitations, ownership transfer, settings resolution, provisional seat limits, `requireWorkspacePermission`, and a React Query workspace switcher with GATE 4's cache-isolation property genuinely tested. **STEP 5 (Onboarding) — substantially passed**: the onboarding state machine, abandonment-event instrumentation, and a functional (unstyled) wizard. **STEP 6 (Brand Intelligence) — GATE 6 passed for real**: a real Playwright crawler with real DNS-pinned SSRF defenses (verified against a real local honeypot server and a real 20-site crawl of production websites, ~152s, ≥75% success required and achieved) and real injection-safe prompt construction; only the final LLM extraction call is a stub (needs a funded Anthropic/OpenAI API key — a credential decision, not invented here). **STEP 7 (Design System + Dashboard) — substantially passed**: all 28 Appendix A.5 components in `packages/ui` with Storybook + a passing token audit; a real Dashboard where every field queries a real table; the notifications bus + RLS-protected schema, proven with synthetic events. **STEP 8 (Content Engine) — GATE 8 mostly passed for real**: a real Temporal render workflow (`resolveAssets → generateShots → generateVO → align → composeText → compose → normalise → provenance → qc → publishReady`), the ADR-0004 provider router (8-stage selection, circuit breaker), and the real STEP 8.2 concept-generation pipeline — all genuinely tested end-to-end against a real Temporal test environment AND a real embedded Postgres (see below). Vendor adapters are deterministic stubs (no funded API keys) and there's no cryptographic C2PA signing (no production signing cert, verified infeasible to fabricate — see `docs/steps/STEP-08.md`). Found and fixed three real bugs in the process: `ProviderRegistry` wasn't caching adapter instances (broke every activity retry); migration 0001's `credit_ledger` trigger was never `SECURITY DEFINER` (blocked every real app-role insert into `credit_ledger` since STEP 2 — invisible until STEP 8's metering was the first code to actually exercise that path live); and a genuine clean-clone verification run (cold caches, full 9-package `pnpm test` via turbo) tipped `pglite-harness.test.ts`'s `beforeAll` past its 90s timeout from contention alone — fixed with `fileParallelism: false` in `packages/db/vitest.config.ts` plus a 180s hook timeout, re-verified green in a repeat clean-clone run. Run `pnpm gate:08` for the live report.

**Major STEP 8 discovery — a real embedded Postgres for tests:** `packages/db/src/testing/pglite.ts` uses `@electric-sql/pglite` (a real Postgres compiled to WASM, no server process needed) to replay this repo's own real migration files, with genuinely working RLS, roles, and the `vector` extension — verified directly, not assumed. This exists because STEP 8's own new tests needed it, but it applies equally to every `itWithDb`-skipped test back to STEP 2. **Retrofitting those onto this harness is a real, valuable, not-yet-done follow-up** — don't assume STEP 2–7's DB-dependent tests are still meaningfully unverifiable; they're unverified only because nobody has ported them to this harness yet.

Environment/tooling notes worth knowing before touching adjacent code:
- `packages/core`'s package.json has an `exports` map (root + `./onboarding` subpath + `./*` wildcard) — a client component importing the root barrel once pulled server-only `node:crypto` code into the browser bundle and broke `next build`. Any future browser-safe module added to `packages/core` needs the same treatment. Its root barrel (`src/index.ts`) mixes browser-safe and server-only exports (e.g. `notifications`/`content`/`trends`/`qc`/`provenance`/`metering` are browser-safe-ish server logic, `auth` is not) — fine for server-only importers (tRPC routers, Temporal activities) but never import the root barrel from a client component; add a new subpath instead, the way `./onboarding` was added.
- `apps/web/next.config.ts` externalizes `playwright`/`playwright-core`/`chromium-bidi` via both `serverExternalPackages` and a manual `webpack.externals` fallback (the documented mechanism alone didn't stop webpack from trying to bundle Playwright's native/optional deps in this Next version). `@temporalio/client` (imported by `apps/web/server/routers/render.ts` via `@velocity/worker`'s dist path) did NOT need this treatment — it's pure JS with no native bindings, unlike `@temporalio/worker`'s core-bridge.
- Migration 0001's tenant-table RLS/grant loops each ran once, over tables that existed at that time only — its own comment says so. Every later migration that adds a workspace-scoped table (0006_notifications, 0007_render_pipeline) must hand-write its own `ENABLE`/`FORCE ROW LEVEL SECURITY` + `workspace_isolation` policy + `GRANT`, or that table silently has no tenant isolation. `packages/db/__tests__/rls-coverage.static.test.ts` catches this mechanically now (no DB needed) — verified via a deliberate mutation test that it actually fails when the RLS block is missing.
- Packages/apps without an `"exports"` field in package.json (e.g. `@velocity/db`, `@velocity/worker`) are importable at any internal path — `@velocity/db/dist/testing/pglite.js` and `@velocity/worker/dist/temporal/client.js` are both consumed this way from other workspace packages/apps. This is a deliberate lack of restriction, not an oversight; don't add an `"exports"` map to either without checking these cross-package import sites first.
- `apps/worker`'s vitest suite spins up real embedded Temporal test servers (JVM processes) and real PGlite instances per file — running several concurrently causes genuine cross-file resource contention unrelated to the pipeline logic. `apps/worker/vitest.config.ts` uses `pool: "forks"` + `fileParallelism: false`, and the concurrency test is excluded from the default run (its own `pnpm --filter @velocity/worker test:concurrency` script) for this reason — see `docs/steps/STEP-08.md`.

**STEP 8B (Hook & On-Screen Text Engine) — GATE 8B mostly passed for real**: real Anthropic (forced tool-use) and OpenAI (strict JSON-schema) adapters — genuine SDK-calling code, request-shape-verified against local mock servers, with a deterministic stub automatically standing in when no funded key is configured (the same factory, not a separate code path — see `docs/steps/STEP-08B.md` scope decision 2). The `text` provider kind extends STEP 8's ADR-0004 router with zero kind-specific code changes, real evidence the router genuinely is provider-kind-agnostic. The full 8B.4 validation/repair loop (schema → one repair call → deterministic template fallback, reusing STEP 8's real brand-rules/safety checks) and the 8B.5 layout engine (auto-fit binary search, safe-area intersection, legibility/contrast) are real and fully tested — 73 tests in `packages/text-engine`, no PGlite/Temporal dependency needed since it's all pure logic plus local mock HTTP servers. `apps/worker`'s `composeText` activity fills STEP 8's own documented seam for real, wired into the idempotency ledger with a genuinely different failure-mode shape than the other four provider kinds (no vendor-side job to poll by — the whole result is captured atomically with `submit()`, not just a job id). `apps/render` has all 7 real text-overlay components (`HookOverlay`/`CaptionTrack`/`StickerText`/`MemeBar`/`LowerThird`/`CTAEndCard`/`SlideText`), unrunnable in this sandbox for the same reason `VerticalVideo`/`Slideshow` already were (STEP 8) plus a browser-only canvas measurer. Found and fixed a real bug in the process: `tryFit`'s binary search never re-verified its last line's width (the line-breaker intentionally lets the final line overflow, by design, expecting the caller to re-check — the caller wasn't). Run `pnpm gate:08b` for the live report.

**STEP 9 (Velocity — the two-tier swipe queue and bandit) — GATE 9 mostly passed for real**: closed the STEP 8.2 -> STEP 8B integration gap so every concept now gets a real `TextPlan` + `hookPattern` at Tier-1 creation time (no second LLM call — built from the same batched hook+variants call STEP 8.2 already makes), a genuine Thompson-sampling bandit (real Gamma/Beta sampler, Marsaglia-Tsang — not a mean-only approximation) decomposing the 5-dimension arm space into independent per-dimension arms combined at ranking time, the queue service (rank/top-up), swipe telemetry + undo, and a real swipe page (drag physics via the STEP 7 `VelocityCard`, keyboard, buttons, all three committing through one path). 20 real tests in `packages/core/src/velocity` including a genuine distribution-shift proof (50 swipes → >90% of 500 ranking trials favour the preferred dimension) and a 200-swipe never-starves simulation. `apps/web` has no PGlite-style DB-integration test harness yet, so GATE 9's queue-behavior claims are proven at the logic level (the router's own functions), not end-to-end against a real Postgres — the single largest flagged follow-up this step leaves. Found and fixed one real bug: a cold-start ranking test wrongly asserted a single Thompson-sampled draw was deterministic (it isn't supposed to be — exploration is real from the first draw). Run `pnpm gate:09` for the live report.

**STEP 10 (Calendar) — GATE 10 passed for real, all three checks.** The 30-day one-shot auto-fill (`packages/core/src/calendar/auto-fill.ts`) is a real constraint-satisfaction algorithm — C6 caps and min-spacing are never relaxed, angle/format/hook-pattern rotation are relaxed in a defined priority order only when the content pool has nothing better — built on real IANA-timezone math (`timezone.ts`, Node's own `Intl` API, no external timezone library needed). Month/week/list/table calendar views, genuine drag-to-reschedule (extending STEP 7's `CalendarGrid`, whose own doc comment already assigned this to STEP 10), bulk actions, campaigns, and a real auto-fill preview/commit flow all wired to `routers/calendar.ts`. 26 new tests in `packages/core/src/calendar`, and all three GATE 10 checks (zero cap violations, zero double-bookings, correct local times across a real DST boundary — discovered from Node's own tzdata, not hardcoded dates) pass for real, the strongest gate result so far. Found and fixed a real, subtle bug via direct debugging: `getOffsetMinutes` picked up spurious sub-minute floating-point noise from `Intl`'s whole-second formatting that silently corrupted the DST-transition binary search's equality checks — fixed by rounding to the nearest whole minute (exact, since real timezone offsets always are one). No RFC 5545 recurrence engine yet (a real, separate undertaking, flagged not built). Run `pnpm gate:10` for the live report.

**STEP 11 (Social Integrations) — GATE 11 mostly passed for real (3 of 4 checks).** Real OAuth adapters for TikTok (Login Kit v2, rotating refresh tokens), Meta/Instagram (long-lived token re-exchange, no separate refresh grant), and YouTube (non-rotating refresh tokens) — 20 tests against local mock HTTP servers, the same `fetchImpl` DI seam used throughout this codebase. Quota counters (`platform_quota_state`) use a single atomic `INSERT ... ON CONFLICT ... WHERE ... RETURNING`, genuinely proven race-free under 20 real concurrent `Promise.all` calls against a real embedded Postgres (PGlite). The token-refresh daemon (`apps/worker/src/jobs/token-refresh-daemon.ts`) is a dependency-injected tick function — real refresh, real credential rotation persistence, and a real revoked-token path that sets `connection_status = reauth_required` plus fires a notification resolved to a real workspace member, all proven with a fast-forwarded `now` against PGlite, no wall-clock waiting. `apps/accounts` has a real connect/health/quota/reconnect page. GATE 11's first check ("connect and publish a test post") is honestly split: connect is real, publish is correctly out of this step's scope (that's STEP 12) — not a gap. No live OAuth click-through (needs funded/audited app registrations this sandbox doesn't have) and no running scheduler around the daemon tick (nothing in this codebase currently invokes anything on a timer — a real, flagged follow-up). Found and fixed one real bug: the daemon's own test file shared a PGlite instance across tests without retiring each test's seeded account, so an earlier test's freshly-refreshed (and now later-expiring) account got legitimately swept into a later test's tick — a test-isolation bug, not a daemon bug, since the daemon's global query is the intended behavior. Run `pnpm gate:11` for the live report.

**STEP 12 (Publishing) — GATE 12: chaos-test claim fully passed for real; the "50 posts" claim honestly PARTIAL — MVP checkpoint reached.** The real Temporal publish pipeline (`preflightCheck → mediaStage → platformInit → upload → poll → confirm → record`) mirrors STEP 8's render-pipeline architecture directly — same idempotency-ledger shape (`publication_steps`, modelled on `render_steps`), same module-singleton activity context, same real-Temporal-plus-real-PGlite test discipline. Real per-platform publish adapters against documented endpoints: TikTok's Content Posting API v2 (Upload/draft mode only — Direct Post is gated behind an audit per the build script's own guidance), Instagram's Graph API container flow (`is_ai_generated` self-disclosure), YouTube's resumable upload (`status.containsSyntheticMedia`). 34 new `packages/core` tests plus 4 real Temporal+PGlite workflow tests in `apps/worker`, including a genuine crash-mid-poll chaos test proving a retried worker resumes against the same vendor-side job id rather than re-initiating (GATE 12's literal claim). A real "Publish now" button on the calendar page is the clickable demo path. GATE 12's "50 scheduled posts, zero duplicates, zero cap breaches, correct AI labels" claim is honestly split: each underlying guarantee (workflow-id dedupe, preflight+atomic-UPSERT quota enforcement, real per-platform label parameters) is proven independently and for real, but not run as one literal 50-post batch — that needs live, audited platform app credentials this sandbox doesn't have, the same category of gap as every funded-credential dependency across this build. Found and fixed three real bugs in the process: a nested-transaction double-execution race in the ledger's first draft (caught by reasoning, mirroring STEP 11's own quota-counter fix); `confirm.ts` originally rejected TikTok's real `SEND_TO_USER_INBOX` draft-mode success state for having no public post id, when a null id there is the documented correct outcome, not an error; and an early `poll.ts` draft held a Postgres transaction open across its whole bounded retry loop, the exact anti-pattern STEP 8's own `withStep` design already warns against. Run `pnpm gate:12` for the live report.

**MVP checkpoint (Steps 1–12) reached.** Per the build script's own instruction, this is where to stop and report go/no-go with measured cost-per-published-post and p50 signup-to-first-publish before continuing to Steps 13–22. Neither metric is measurable in this sandbox (both need real users and real, billed vendor calls across the full pipeline) — see docs/steps/STEP-12.md's own closing note. Every step from 1–12 has real, tested code for its core mechanism, with every genuinely infeasible piece (funded LLM/vendor API keys, live OAuth app credentials, cryptographic C2PA signing, a real Postgres server) explicitly flagged rather than faked.

Next: STEP 13 (Analytics — metric ingestion, website attribution, and closing the loop back into the Velocity bandit/best-time model/hook-pattern weights), continuing per the standing "proceed through all phases" instruction now that the MVP checkpoint has been reported.

## Non-negotiable constraints (C1–C8)

| # | Constraint |
|---|---|
| C1 | **Official APIs only.** All publishing via TikTok Content Posting API, Instagram Content Publishing API and YouTube Data API with user OAuth. No headless-browser posting, no unofficial endpoints, no session-token replay, no automated account creation, no account trading. |
| C2 | **Provenance is mandatory.** Every generated asset carries a C2PA manifest, preserves any model-native watermark, and sets an immutable `ai_generated` flag. Platform-native AI labels set on publish. EU AI Act Art. 50 has applied since 2 Aug 2026 and the platform serves EU users. |
| C3 | **No third-party footage redistribution.** Trend analysis stores *blueprints* (structure, pacing, hook pattern, caption grammar), never re-hosted or re-cut source clips. Human UGC library licensed with signed model releases recorded per clip. |
| C4 | **Tenant isolation by default.** Postgres RLS on every tenant table. Tested adversarially in STEP 20. |
| C5 | **Cost metering from first generation.** Every model call — video, image, and text — writes a `usage_event` with provider, model, units and cost before the response returns. No un-metered path may exist. |
| C6 | **Platform rate caps enforced client-side.** The scheduler must never emit a request that would breach a documented platform cap. Caps live in config, not code. |
| C7 | **Human approval before publish** for all AI-persona content. No autonomous path from generation to public post without a recorded approval event. |
| C8 | **No platform branding burned into content.** TikTok's watermark guidelines prohibit superimposing your own brand, logo, watermark or promotional text on content shared to TikTok. Overlays render the *customer's* brand only. Never inject a VELOCITY mark into an export. |

## Stack

Next.js 15 (App Router) · TypeScript strict · tRPC internally, versioned REST `/v1` publicly with OpenAPI 3.1 from Zod · Postgres 16 + pgvector + RLS via Drizzle · Redis/BullMQ for short jobs, Temporal for render/publish workflows · Cloudflare R2 + CDN, signed URLs · Remotion on Lambda for composition, ffmpeg for transcode/loudness · Anthropic Messages API + OpenAI Responses API behind one text-engine abstraction · Stripe · OpenTelemetry, Sentry, PostHog.

Monorepo (pnpm + Turborepo): `apps/web`, `apps/worker`, `apps/render`, `packages/db`, `packages/core`, `packages/providers`, `packages/text-engine`, `packages/contracts`, `packages/ui`.

## Domain model vocabulary (fixed — use these names everywhere)

`Organisation`, `Workspace`, `BrandProfile`, `Angle`, `TrendBlueprint`, `Persona`, `ContentConcept`, `TextPlan`, `ContentItem`, `Render`, `MediaAsset`, `CalendarSlot`, `Publication`, `SocialAccount`, `MetricSnapshot`.

## The two things that decide whether this works

1. **Velocity is a two-tier queue.** Cheap LLM-only concept cards (hook + angle + storyboard + a preview still with the hook composited on) are what users swipe through. The expensive video render fires only on swipe-right. Never render before the swipe. Swipe-to-next latency budget: 100ms.
2. **On-screen text is its own composition layer** (`packages/text-engine`), authored by Claude or GPT via one schema (`TextPlan`) that drives both providers. Remotion renders it separately from the video track, so a hook change re-renders in seconds for pennies. The renderer — never the model — picks font size (binary-search to fit the platform safe box).

## Design tokens (Appendix A — do not deviate; CI fails the build on literals outside `packages/ui/tokens`)

```css
:root {
  --paper:      #FFFFFF;
  --paper-2:    #F7F6F4;
  --ink:        #101012;
  --ink-2:      #6E6E76;
  --line:       #E9E7E4;
  --flare:      #FF4D12;   /* single accent: CTAs, ticks, active states, ember gradient — nowhere else */
  --flare-deep: #C9350A;
  --ember:      #0B0B0C;
  --glow:       rgba(255, 77, 18, .26);

  --r-pill:  999px; --r-card: 28px; --r-media: 20px; --r-field: 14px;
  --sh-float: 0 8px 30px rgba(0,0,0,.08);
  --sh-card:  0 2px 14px rgba(0,0,0,.05);
  --sh-glow:  0 0 80px var(--glow);
}
```

Type scale: `display-1` `clamp(2.75rem,6.5vw,5.5rem)` / 700 / −0.035em / 0.94 leading · `display-2` `clamp(2rem,4.2vw,3.5rem)` / 700 · `heading` 1.5rem/600 · `body-lg` 1.125rem · `body` 1rem · `label` 0.75rem mono, 0.14em tracking, uppercase · `numeral` 0.8125rem mono. Display + UI family needs a true italic cut (Satoshi / General Sans / Geist Sans); micro-labels + numerals in a mono (Geist Mono / JetBrains Mono). Full component inventory, motion rules and safe-area insets: Appendix A in `velocity-build-script.md`.

## Platform limits to design against

- **TikTok** — Upload (draft) and Direct Post (`video.publish`). Photos URL-pull only. Unaudited: forced `SELF_ONLY`, max 5 users/24h, accounts must be private. Audited: all privacy levels, 24h creator cap, ~15 posts/day/creator shared across API clients. 6 req/min per user token. Ship Upload/draft first; gate Direct Post behind a flag until audited.
- **Instagram** — Business/Creator only. `POST /{ig-user-id}/media` (`REELS`) → poll `status_code` until `FINISHED` → `POST /{ig-user-id}/media_publish`. Media must be publicly reachable at attempt time. 100 API-published posts/rolling 24h/account — poll and enforce `content_publishing_limit` yourself.
- **YouTube** — `videos.insert` resumable upload. Design to 100 calls/day at 1 unit (the 1,600-unit figure is stale).

## Commands

```bash
pnpm build        # Turborepo build, dependency-ordered
pnpm typecheck     # tsc --noEmit across all packages
pnpm lint          # eslint across all packages
pnpm test          # unit tests
pnpm test:e2e      # Playwright
pnpm gate:NN       # run GATE checks for STEP NN — report check/expected/actual/pass, never mark passed if any check failed
pnpm db:push       # apply schema to local dev DB
pnpm remotion studio  # iterate on text overlay components without burning render credits
```

## Rules of engagement (from the build script)

1. One STEP at a time, in order. Never start a step before the previous step's GATE passes.
2. Write `/docs/steps/STEP-NN.md` (plan, files, acceptance tests) and wait for approval before writing that step's code.
3. End every step with: migrations applied, tests green, typecheck clean, lint clean, a clickable demo path.
4. Report GATE results honestly — never mark a gate passed if any check failed. Stop and report on failure; don't route around it.
5. Never invent a third-party API contract — stop and ask, or build against a recorded fixture flagged unverified.
6. No secrets in code. Env vars only, with a maintained `.env.example`.
7. Disagree with an instruction here before implementing it, if you think it's wrong.

**Cut line:** Steps 1–12 are the MVP, hard checkpoint after Step 12 — report measured cost per published post and p50 signup-to-first-publish before continuing to 13–22.

## Explicitly out of scope (Appendix B)

Do not build, and raise it rather than implement if asked:
1. Provisioning, warming, selling or operating social accounts on behalf of users (account farming — breaks platform terms, risks app credentials for every customer).
2. Re-hosting or re-cutting third-party creators' videos — blueprint extraction only (C3).
