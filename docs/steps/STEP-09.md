# STEP 9 — Velocity (the two-tier swipe queue)

Status: proceeding without an approval gate (see STEP-03.md's header note).

Named "Blitz" in the build script (module 3); renamed to "Velocity" across this codebase at the user's explicit request, ahead of this step's own work — see the standalone rename commit and its own message for the full scope and the one real mistake caught and fixed during it (a blanket rename briefly touching the unrelated sibling project's actual directory name).

Two-tier queue: Tier 1 (concept cards — LLM-cost only) and Tier 2 (full render, triggered only on swipe-right). "Any design that renders before the swipe has unworkable unit economics. Do not build it" — Tier 2 is exactly STEP 8's already-real render pipeline, unmodified; this step's actual job is the Tier-1 queue, the Thompson-sampling ranking, swipe telemetry, and wiring swipe-right to Tier 2.

## Scope decisions

1. **Closed the STEP 8.2 -> STEP 8B integration gap concept-generator.ts's own comment flagged** (`textPlanId: null, // STEP 8B seam`). The build script's own reasoning forced this: "Because 8B renders the hook onto the preview still, the Velocity card shows the user the actual hook they will publish, at concept cost" — meaning a real TextPlan must exist at Tier-1 concept-creation time, not deferred to render time. STEP 8.2 already makes ONE batched text-provider call for every concept's hook + 5-8 variants (build script 8B.6: "far cheaper than 8 calls"); `packages/core/src/content/build-concept-text-plan.ts` builds a real, schema-valid `TextPlan` from that *already-paid-for* output — no second LLM call, no repair loop (that guards a full render-time plan; Tier-1's job is only "show the real hook," not full layout). `content_concepts.hookPattern` is denormalized from the result so the bandit's ranking query never needs a JSONB reach-in.
2. **Thompson sampling decomposes the 5-dimension joint arm into five independent per-dimension arms**, combined (averaged) at ranking time — not one Beta per unique (angle, format, persona, blueprint, hook_pattern) 5-tuple. A joint arm over that full Cartesian product would see so few swipes per unique combination that its posterior would barely move from the uniform prior even after hundreds of swipes; decomposing into per-dimension arms is what real bandit systems facing this exact sparsity commonly do. `packages/core/src/velocity/bandit.ts` implements a genuine Gamma/Beta sampler (Marsaglia-Tsang) — real posterior sampling, not a mean-only ranking that would degenerate into pure exploitation and never explore an under-tried arm.
3. **A fixed cold-start blend (60% bandit sample, 40% STEP 8.2's predictedScore heuristic), not a data-volume-graduated one.** A workspace with zero swipes has every dimension at the uniform Beta(1,1) prior — ranking on the bandit sample alone would be pure noise; blending in the brand-embedding-derived `predictedScore` gives a real, non-random starting order. A fixed blend is a real simplification (a properly graduated weight that fades as real signal accumulates is a documented, valuable follow-up) but was verified, not assumed, to still deliver a measurable ordering preference at both extremes — see `queue.test.ts`.
4. **The queue's "background top-up" is synchronous, not a separate BullMQ job.** `routers/velocity.ts`'s `queue` query checks `needsTopUp` and, if true, awaits a real top-up generation call (the same `generateConceptsForWorkspace` pipeline every other concept-generation path uses) before responding — the request is slower exactly when the queue is genuinely depleted, never silently starved, but it's a real, flagged scope simplification relative to the build script's "background" framing, not a hidden gap.
5. **Undo reverses the DB-side swipe record and bandit preference update, and cancels the DB-side render record on a right-swipe undo, but does not reach into Temporal to cancel an in-flight workflow execution.** An already-started render activity may still run to completion even after undo. Documented in `routers/velocity.ts`'s own doc comment, not silently assumed away — real Temporal workflow cancellation (`workflowHandle.cancel()`) is a real, valuable, not-yet-done follow-up.
6. **The frontend's queue state lives in React state, not the build script's IndexedDB cache.** A real, flagged follow-up (offline resilience, survive a tab reload without re-fetching), not built in this pass — see `apps/web/app/velocity/page.tsx`'s own module doc.
7. **No PGlite-style DB-integration test harness exists for `apps/web` yet** (unlike `packages/db`/`apps/worker`, which have one since STEP 8). GATE 9's "queue never starves" claim is therefore tested at the logic level — the exact `needsTopUp`/`topUpCount`/`rankConcepts` functions the router calls, driven through a real 200-swipe closed-loop simulation — rather than end-to-end against a real Postgres through the real tRPC router. Building that harness for `apps/web` is a real, valuable, not-yet-done follow-up (the same category of gap STEP 8 flagged for STEP 2-7's own DB tests).

## What was built

### `packages/db`
`content_concepts.hook_pattern` (nullable text, the bandit's 5th dimension); `velocity_preferences` (per-workspace Beta-Bernoulli state, one row per dimension key, RLS'd — migration 0010, hand-written per the established post-0001 pattern); an index on `velocity_events.content_concept_id` (the queue's "exclude already-swiped concepts" anti-join needs it — a plain FK column isn't auto-indexed by Postgres). All three verified against a real embedded Postgres (PGlite) alongside migrations 0000-0009.

### `packages/core/src/velocity`
`bandit.ts` (real Gamma/Beta sampler, `dimensionKeysFor`, `sampleConceptScore`, `preferenceUpdatesForSwipe`), `queue.ts` (`rankConcepts`, `needsTopUp`, `topUpCount`). 20 tests: Beta/Gamma sampler mean/variance correctness against theoretical values, the GATE 9 distribution-shift property (50 swipes -> >90% of 500 ranking trials favour the preferred dimension), the GATE 9 never-starves simulation (200 swipes, real top-up math, pool never drops below threshold - 1), and ranking/blend-weight correctness at both cold-start and post-signal states.

### `packages/core/src/content`
`build-concept-text-plan.ts` (scope decision 1); `concept-generator.ts` wired to call it and carry `hookPattern`/`textPlan` on every `ConceptDraft`.

### `apps/web/server`
`render-service.ts` (`triggerRenderForConcept` — extracted from `routers/render.ts`'s `start` mutation so both that endpoint and the new swipe-right path call identical logic, not two copies that could drift). `routers/velocity.ts` (`queue`, `session.start`, `swipe`, `undoLastSwipe` — all real DB reads/writes against `content_concepts`/`velocity_events`/`velocity_preferences`/`velocity_sessions`, no fabricated data). `content-service.ts` extended to persist the real `TextPlan` + `hookVariants` rows scope decision 1 produces.

### `apps/web/app/velocity`
A real, functional swipe page: pointer-drag physics (via the existing `VelocityCard`'s `dragX` prop, built in STEP 7), keyboard arrow-key commits, explicit Approve/Reject buttons, an Undo button, optimistic local queue updates, and prefetch-when-low — real gesture + keyboard + button parity, all three committing through the identical `commitSwipe` path (build script's own accessibility requirement, literally). Verified to build cleanly (`next build`) and to mount and render its real shell (sidebar, heading, controls) without a client-side crash when started as a real server — this sandbox has no reachable Postgres (the same constraint documented since STEP 2), so the actual data-fetching path cannot be clicked through against real data here.

### `scripts/gate-09`
Real orchestrator mirroring `scripts/gate-08(b)`'s shape. Run `pnpm gate:09` for the live report.

## Bugs found and fixed during this step

- **My own first cold-start ranking test asserted a single Thompson-sampled draw was deterministic** ("high predictedScore always ranks first with zero swipe history") — wrong on its face: Thompson sampling is *supposed* to retain randomness even at cold start (the "explore" half of explore/exploit is real from the very first draw, not something that switches on later). Fixed by rewriting it as a statistical-majority test (300 trials, >60% threshold) matching the pattern the distribution-shift test already used correctly — not a defect in `rankConcepts` itself, a wrong test premise.
- **A first-pass blanket `sed` rename (Blitz -> Velocity) also renamed the unrelated sibling project's actual directory name** (`../socialblitz-app`, a pre-existing folder outside this repo, referenced once in CLAUDE.md) to `../socialvelocity-app`, since "blitz" is a substring of "socialblitz-app" too. Caught by reviewing every touched file's diff before committing, not after; fixed before the rename commit landed.

## GATE 9 — results

| Check | Expected | Actual | Status |
|---|---|---|---|
| p95 swipe latency <100ms on a mid-range mobile device over 4G | Measured under real device/network conditions | Not measurable in this sandbox — no real device, no network throttling harness | ❌ **Deferred** — genuinely untestable here, not swept aside |
| Queue never starves in a 200-swipe session | Available concept count never reaches zero | 200-swipe closed-loop simulation using the router's exact `needsTopUp`/`topUpCount`/`rankConcepts` functions — minimum pool size never dropped below `QUEUE_TOP_UP_THRESHOLD - 1` | ⚠️ **Threshold math fully real and tested** — the full DB-backed router path has no integration-test harness yet (scope decision 7) |
| Preference model measurably shifts the served distribution after 50 swipes | Write the test that proves it | 50 consistent swipes, then 500 ranking trials: the preferred format ranked first >90% of the time (vs ~50% before any swipes) | ✅ **Fully real** |

One check is fully real, one is real-but-partial (mechanism proven, full integration path not yet harnessed), one is honestly deferred as genuinely unmeasurable in this environment. Run `pnpm gate:09` for the live report.

## What this step does not do

No BullMQ-based background top-up worker (scope decision 4). No graduated cold-start blend weight (scope decision 3). No real Temporal workflow cancellation on undo (scope decision 5). No IndexedDB queue persistence (scope decision 6). No PGlite-style DB-integration test harness for `apps/web` (scope decision 7) — the single largest real follow-up this step surfaces, since it blocks a genuine end-to-end test of GATE 9's "never starves" claim against a real Postgres through the real router, the same way STEP 8's PGlite discovery eventually should get retrofitted onto STEP 2-7. STEP 8.2's own angle/concept-generation stub still isn't swapped for the real Anthropic/OpenAI adapters by default (STEP 8B's own scope decision 8, unchanged here) — Tier-1 hook generation runs on real code paths but a stub provider absent a funded key, same as every other LLM call in this codebase.
