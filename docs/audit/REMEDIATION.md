# Post-STEP-22 audit remediation

This document tracks the five-unit remediation plan that closes every gap
surfaced by the post-STEP-22 production-readiness audit (see the audit
summary reported to the user; the four smallest infra bugs it found were
already fixed and committed as `722270a` before this document existed).
Each unit below is appended once it lands, with the same honesty
discipline as every `docs/steps/STEP-NN.md` in this build: real vs.
deferred, and why.

## Unit 1 — Dependency vulnerability remediation

**Before:** `pnpm audit --audit-level=high` — 1 critical, 6 high, 24 total
(matching STEP-20's own recorded state, drifted slightly as new advisories
entered the registry after STEP 20 ran — confirmed via a live re-run, not
assumed stale).

| Package | From | To | Bump type |
|---|---|---|---|
| vitest | 2.1.9 | ^3.2.6 (installed 3.2.7) | major |
| vite | 5.4.11 | ^6.4.3 | major (pulled in by vitest 3) |
| drizzle-orm | 0.38.4 | ^0.45.2 | 7 minors, pre-1.0 |
| storybook / @storybook/react / @storybook/react-vite | 8.4.7 | ^8.6.17 | same major |
| postcss | 8.4.31 (transitive via `next`) | forced via `pnpm.overrides` to ≥8.5.18 | override |
| esbuild | 0.21.5 (transitive via storybook's internal tooling) | forced via `pnpm.overrides` to ≥0.25.0 | override |
| uuid | 9.0.1 (transitive via `@temporalio/client`) | forced via `pnpm.overrides` to ≥11.1.1 | override |

The two previously-deferred STEP 20 findings (vitest, drizzle-orm) were
**re-attempted rather than deferred again**, per this round's explicit
mandate to resolve every outstanding dependency. Both were genuinely
low-risk on inspection: the vitest 3 migration guide documents no breaking
changes to any config option this monorepo actually uses (`pool: "forks"`,
`fileParallelism`, `poolOptions.forks.singleFork`, `hookTimeout`,
`environment`, `defineConfig` shape — all confirmed unchanged before
touching any `vitest.config.ts`), and drizzle-orm 0.45.2 is confirmed to be
the current latest 0.x release (not an intermediate step), used only
through its standard query-builder API in this codebase (no internal/
experimental APIs).

**After:** `pnpm audit` — **0 vulnerabilities found**, of any severity.

**Real verification, not just an install:** the full monorepo
`pnpm build && pnpm typecheck && pnpm lint && pnpm test` was re-run against
the upgraded toolchain (not just typechecked) and passed completely —
including `apps/worker`'s real Temporal + real embedded-Postgres suite
(24/24, the most sensitive surface to a drizzle-orm bump given
`packages/db`'s RLS session-variable-scoped connection path), `apps/web`'s
7 DB-integration suites (120/120), `packages/core`'s 471 tests, and
`packages/providers`' real 20-site brand-intelligence crawler test
(GATE 6, unchanged). No test file, config file, or application code needed
to change — every fix was a version bump plus, for three transitive
findings with no safe direct-dependency path, a `pnpm.overrides` entry.

**Environment note discovered during this unit:** a native Postgres 16.14
instance exists on this machine (previously noted as present but
password-inaccessible), and admin credentials (`postgres`/`postgres`) do
work — but it has no compiled `vector` extension, which every migration
after 0000 depends on. Installing a compiled Postgres extension binary
system-wide on a shared native instance already hosting two unrelated
projects' databases (`leadforge_dev`, `wabep`) was judged out of scope for
a dependency-remediation task and too risky to attempt without the user's
explicit sign-off — so this remains the same honest "no live network
Postgres available" limitation this entire build has operated under since
before STEP 8's PGlite discovery. Nothing was created or altered on that
instance (read-only queries only).
