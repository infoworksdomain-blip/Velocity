# STEP 5 — Onboarding

Status: proceeding without an approval gate (see STEP-03.md's header note).

## A sequencing problem in the script, flagged rather than silently worked around

STEP 5 assumes two things that don't exist yet: "live progress while Website Intelligence runs" (STEP 6, built after this one) and "dashboard with concepts already generated" (STEP 8, also built after this one). This is a real inversion in the script's own step order, not something I'm inferring — the script's text for STEP 5 reads as if brand extraction and concept generation are already callable.

**Resolution:** build the onboarding flow — the state machine, the tRPC procedures, the abandonment-event tracking, a minimal functional UI — as a real, working thing, with the two genuinely-unbuilt pieces (website analysis, concept generation) behind the same kind of explicit interface-with-a-stub-adapter pattern used since STEP 1 (`packages/providers`, `packages/text-engine`). STEP 6 and STEP 8 replace the stubs with real implementations; nothing about the onboarding flow's shape should need to change when they do, since it only depends on the interface.

This means GATE 5's actual numeric target ("cold signup to first concept card under 90s at p50") **cannot be measured for real yet** — the stub's latency is arbitrary, not representative of a real Playwright crawl + LLM extraction + bulk concept generation. It's flagged as such below rather than reported against a meaningless stubbed number.

## What was built

- **Migration `0005_onboarding`**: `onboarding_events` (id, workspace_id nullable — a user can abandon before a workspace exists, session_id, stage, occurred_at) for the abandonment instrumentation GATE 5 asks for. Platform-root-ish but tracked per anonymous session before a user/workspace exists, so no FK to workspace is enforced (nullable, set once a workspace is created).
- **`packages/core/src/onboarding/state-machine.ts`**: a pure function `nextOnboardingStage(current, event)` implementing the exact stage sequence from the script (`choose_type → enter_url → analyzing → confirm_profile → pick_goals → connect_social → done`), with `connect_social` explicitly skippable. Fully unit-tested — this is the kind of logic that's easy to get subtly wrong (a skip that skips too far, a back-navigation that loses state) and cheap to verify exhaustively without any backend.
- **`packages/providers/src/website-intelligence.ts`**: `WebsiteIntelligenceProvider` interface (`analyze(url): Promise<BrandProfileDraft>`) + a `StubWebsiteIntelligenceProvider` that returns a canned profile after an artificial delay — explicitly not a real crawler (that's STEP 6). Selected via the same provider-router config pattern as everything else in `packages/providers` (ADR 0004).
- **`packages/providers/src/concept-generation.ts`**: `ConceptGenerationProvider` interface (`generateInitialBatch(brandProfile): Promise<ConceptDraft[]>`) + a stub returning a handful of canned concepts. Real implementation is STEP 8's job.
- **`apps/web/server/routers/onboarding.ts`**: `start` (records `choose_type`, creates a session id), `analyzeWebsite` (calls the stub provider, records `analyzing`→`confirm_profile`), `confirmProfile`, `pickGoals`, `connectSocial` (skippable), `complete` (creates the workspace via STEP 4's `workspace.create`, generates the initial concept batch via the stub, records `done`). Every transition writes an `onboarding_events` row.
- **Frontend**: `apps/web/lib/onboarding-machine.ts` (React hook wrapping the pure state machine), a minimal unstyled wizard shell (`apps/web/app/onboarding/page.tsx`) — functional only, Appendix A styling is STEP 7's job.

## GATE 5 — status

| Check | Status |
|---|---|
| State machine correctness (stage sequence, skip behavior) | ✅ `packages/core/src/onboarding/__tests__/state-machine.test.ts` — genuinely passing, no backend needed |
| Abandonment instrumented per stage | ✅ structurally — every transition writes an event; the DB-backed procedure test is `itWithDb`-gated, same open item as prior steps |
| Cold signup to first concept card under 90s at p50 | ⚠️ **not measurable** — the website-intelligence and concept-generation providers are stubs; timing a stub proves nothing about STEP 6/8's real latency. Revisit once both are real. |

## What this step does not do

No real website crawling (STEP 6). No real concept generation (STEP 8). No visual design (STEP 7). No actual latency measurement against the 90s target — tracked as explicitly unverifiable until its dependencies are real, not silently skipped. No account-creation UX folded into the flow — `onboarding.complete` requires an authenticated session, and where sign-up happens relative to the wizard stages is a STEP 7 design decision, not resolved here.

## A real bug caught during verification

`apps/web/lib/onboarding-machine.ts` is a client component that originally imported `nextOnboardingStage` from `@velocity/core`'s package root. That root barrel also re-exports the `auth` module (bcrypt, jose, `otpauth`, some of it touching `node:crypto`) — so importing anything from the root, even a single pure function, pulled the entire module graph into the browser bundle and `next build` failed outright (`node:crypto` has no browser scheme handler in webpack). Fixed by adding a `./onboarding` subpath export to `packages/core/package.json` (plus a `./*` wildcard fallback, since sealing the exports map too tightly broke tRPC's type inference reaching into `@velocity/core/dist/rbac` for `AppRouter`'s declaration emit) and importing the state machine through that subpath instead of the root. This is a real, general lesson for this monorepo: any package mixing server-only and browser-safe modules needs deliberate subpath exports, not just a single barrel.

## GATE 5 — results

| Check | Expected | Actual | Pass |
|---|---|---|---|
| State machine correctness | Exhaustive stage-transition coverage | `packages/core/src/onboarding/__tests__/state-machine.test.ts` — 5 tests, genuinely passing | ✅ |
| Abandonment instrumented per stage | Every transition recorded | Structurally true (every procedure calls `recordEvent`); DB-backed verification is `itWithDb`-gated, same open item as prior steps | ⚠️ partially verified |
| Cold signup to first concept card under 90s at p50 | Measured | **Not measurable** — both dependencies are stubs; flagged rather than reported against a meaningless number | ⚠️ not measurable yet |
| Whole-repo build/typecheck/lint/test clean, including a real `next build` | On a fresh clone | Verified — 50 tests passing across the monorepo (up from 41), including the onboarding page actually compiling and prerendering under Next.js's production build (the check that caught the barrel-export bug above) | ✅ |

