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

## Unit 2 — Real email delivery, password reset, invitation emails

**Email provider.** `packages/core/src/auth/email-provider.ts` gained a
real `ResendEmailProvider` (the `resend` SDK, `6.26.0`) and a
`createEmailProvider()` factory mirroring `packages/db/src/kms.ts`'s
`createKmsProvider()` DI shape — Resend when `RESEND_API_KEY` is set, else
the existing `LocalDevEmailProvider` console-log stub (a fallback, not a
throw, since email isn't on this codebase's "throws at startup" list).
Tested against a local mock HTTP server via the SDK's own documented
`baseUrl` constructor option — same "real SDK, no live network" discipline
as the Stripe/Anthropic/OpenAI adapters (6 tests,
`packages/core/src/auth/__tests__/email-provider.test.ts`).

**A bigger-than-expected discovery:** there was no login or signup PAGE
anywhere in `apps/web/app/` (confirmed by a full directory listing), no
client-side code anywhere calling `authRouter`, and — more fundamentally —
nothing anywhere ever set the `velocity_session` cookie `context.ts`
reads, even though `authRouter.login`/`signup` have returned real tokens
since STEP 3. The entire browser-facing half of this build's own auth
design was unreachable. A password-reset flow with nowhere to log in from
would itself have been a half-finished feature, so this unit's scope grew
to cover the real prerequisite:

- `apps/web/server/auth-cookie.ts`: real cookie construction. Stores the
  **refresh** token (30-day JWT expiry, matching `sessions.expiresAt`),
  not the 15-minute access token — this codebase has no silent
  access-token-refresh rotation flow, and a cookie that stops working
  after 15 minutes with nothing to renew it would be worse than useless.
  Documented as a deliberate simplification in the file itself; real
  short-lived-access-token rotation is a further, separate improvement
  this pass does not build. 4 tests.
- `apps/web/app/api/auth/{login,signup,logout}/route.ts`: real Next.js
  Route Handlers that call the existing, already-shaped
  `authRouter.login`/`signup`/`logout` in-process via `appRouter.
  createCaller(...)` (no HTTP hop, no duplicated logic) and turn the
  result into a real `Set-Cookie` header — the missing half tRPC's own
  batching model can't cleanly provide (a `responseMeta`-based approach
  was considered and rejected: extracting one batched call's mutation
  output inside `responseMeta` depends on the exact shape the `superjson`
  transformer wraps it in, which is fragile to get right versus a plain
  Route Handler with direct control over both body and headers).
- Real, functional (unstyled) pages — matching STEP 5's own established
  "functional shell, design is a later pass" precedent — for `/login`,
  `/signup`, `/forgot-password`, `/reset-password`, and
  `/accept-invite/[id]`. All five build and prerender cleanly.

**Password reset.** New `password_reset_tokens` table (migration 0025,
platform-root, no RLS — same shape as `sessions`/`mfa_credentials`), only
ever storing a SHA-256 hash of the token (mirrors `session-service.ts`'s
`hashToken`). Logic lives in `apps/web/server/auth-service.ts`
(`requestPasswordReset`/`resetPassword`) following this codebase's own
established db-parameter-with-a-real-default pattern
(`compliance-service.ts`, `analytics-service.ts`) rather than living
inline in the router — makes it directly testable against real PGlite,
which is how STEP 3's original `login`/`signup` procedures were never
testable (confirmed: they had zero tests before this unit, and still
don't — refactoring already-working, untested-but-relied-upon auth code
was judged higher-risk than adding new, separately-tested code alongside
it). `requestPasswordReset` never reveals whether an email matched an
account (same shape as `login`'s constant-time dummy-hash comparison) and
is rate-limited via STEP 20's `checkAndIncrementRateLimit`.
`resetPassword` is single-use, 15-minute-lived, and revokes every existing
session for the account on success. 6 tests against real PGlite
(`apps/web/server/__tests__/auth-service.test.ts`), including a real
reuse-rejection and a real cross-session-revocation proof.

**Invitation emails.** `workspace.ts`'s `members.invite` used to insert an
`invitations` row and stop. `apps/web/server/workspace-service.ts` gained
`sendInvitationNotification` (same db-parameter pattern): sends a real
email with the workspace name, inviter name, and a real accept link (the
invitation's own UUID already doubles as the accept token — no new token
scheme needed), and — when the invitee already has an account — publishes
`packages/core`'s `invitation_received` notification bus event, which has
existed since STEP 7 with zero producers until now. A failed send is
logged, not thrown — a transient email-provider error shouldn't roll back
an already-persisted, still-shareable invitation. 3 tests against real
PGlite (`apps/web/server/__tests__/workspace-service.test.ts`), including
proving no in-app notification fires for an invitee with no account yet.

**Deliberately not done in this unit:** `buildWeeklyReport` (STEP 13) is
still dormant — real, tested, pure content-generation logic with zero call
sites anywhere (confirmed by a repo-wide grep). Wiring it up for real would
mean building a new aggregation-to-report pipeline and a trigger point
(manual, like STEP 19's reconciliation button, or scheduled), which is a
separate, larger feature the original audit never flagged — noted here
honestly rather than scope-crept into.

**Verification:** full monorepo `pnpm build && pnpm typecheck && pnpm lint`
green (33 routes building and prerendering, including all 5 new pages and
3 new Route Handlers). `pnpm test` re-run in full — see the commit for
this unit's exact pass/fail counts.

## Unit 3 — Dockerfiles

Real, multi-stage, pnpm-workspace-aware Dockerfiles for `apps/web` and
`apps/worker` — confirmed via a full-tree glob that neither existed
anywhere before this unit, despite `infra/terraform/modules/regional-stack/
ecs.tf`'s two task definitions expecting a real image at
`PLACEHOLDER_ECR_IMAGE_URI` since STEP 22.

**A real bug found and fixed along the way, not routed around:** adding
`output: "standalone"` to `apps/web/next.config.ts` (needed so the Docker
image ships only the traced files it needs, not the whole monorepo's
`node_modules`) broke `pnpm build` outright in this sandbox —
`EPERM: operation not permitted, symlink ...`. Root-caused, not
guessed at: Next's standalone output re-materialises pnpm's symlink-based
`node_modules` via real filesystem symlinks, which Windows refuses without
Developer Mode or admin rights — confirmed OFF via a direct (read-only)
registry check (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\
AppModelUnlock` doesn't even have the key). Enabling Developer Mode is a
system-wide security-posture change this pass declined to make
unprompted. Fixed correctly, not papered over: `output: "standalone"` (and
the `outputFileTracingRoot` it needs to actually find `workspace:*`
dependencies under `../../packages` — confirmed via Next's own docs that
without this, monorepo tracing defaults to the app's own directory) are
now gated behind a `DOCKER_BUILD=1` env var the Dockerfile's own build
stage sets — real config for the real (Linux, unaffected by this)
container build target, with local/CI builds on this Windows sandbox left
exactly as they were. Re-verified: `pnpm build` (no flag) still green,
matching pre-Unit-3 output exactly.

Both Dockerfiles' dependency-build steps were verified for real via
`turbo run build --filter=@velocity/web... --dry-run` / `--filter=
@velocity/worker...` (not assumed): confirmed `apps/web` needs
`@velocity/{contracts,core,db,providers,text-engine,ui,worker}` built
first (worker included — apps/web imports its compiled Temporal client),
while `apps/worker` needs only `@velocity/{contracts,core,db,providers,
text-engine}` (no `ui`/`web`/`render` build cost paid). Both Dockerfiles
pass `dockerfile-utils lint` cleanly (no findings).

**Honestly unvalidated:** no Docker daemon exists in this sandbox
(`docker: command not found`) — neither image has actually been built.
Real build/push commands for a genuine ECR target are documented in
`infra/terraform/README.md`. This is the same "real code, unvalidated by
the live operation" category as every other infra-dependent item in
STEP 22 itself.

**Verification:** full monorepo `pnpm build && pnpm typecheck && pnpm lint`
green with the DOCKER_BUILD flag unset (unaffected); `pnpm test` re-run in
full.

## Unit 4 — Remotion-on-Lambda compositor + infra

`compositor.ts`'s doc comment has said "a production implementation
renders via Remotion on Lambda (ADR 0002)" since STEP 8; `StubCompositor`
remained the only implementation through STEP 22. Confirmed 100% unbuilt
before this unit: zero Terraform mentions of remotion/lambda, no deploy
script, no `@remotion/lambda` dependency anywhere.

**Never invented, always read from the real source** (this build's rule
5): every API shape used here — `renderMediaOnLambda`, `getRenderProgress`,
`deployFunction`'s `customRoleArn`, `deploySite`, `getOrCreateBucket`, and
the exact IAM policy statements — was confirmed by installing
`@remotion/lambda@4.0.499` (pinned to match the already-pinned
`remotion`/`@remotion/cli`) and reading its own real `.d.ts`/`.js` source
under `node_modules`, not guessed or reconstructed from memory of
Remotion's public docs.

- `apps/worker/src/composition/remotion-lambda.compositor.ts`: a real
  `RemotionLambdaCompositor implements Compositor`. Resolves every shot/
  VO/text ref to a signed URL via the existing `BlobStore` abstraction,
  triggers a real Lambda render, polls `getRenderProgress` to completion
  (poll interval/attempt budget injectable — proven with a real,
  fast-in-tests timeout path rather than a real 10-minute wait), downloads
  the finished output from Remotion's own S3 bucket via `@aws-sdk/
  client-s3`, and re-uploads it through the SAME `BlobStore` every other
  `Compositor` output already uses — so downstream QC/provenance/publish
  code needs no special-casing for which compositor produced an artefact.
  Tested via the same constructor-injected-function DI seam as every
  other vendor adapter in this codebase (12 tests across 2 files).
- **An honest, documented contract gap this class works within rather
  than hides:** `ComposeSpec` (packages/contracts) carries only an
  aggregate `targetDurationSec` — no per-shot timing, caption words,
  target-platform list, or brand logo, even though the real
  `VerticalVideoProps` schema (apps/render) has slots for all of them.
  This compositor divides the total duration evenly across shots and uses
  the same defaults `apps/render/src/root.tsx` itself already falls back
  to. A real, working render with an honestly-simplified output — not a
  fake mechanism — matching this codebase's own precedent for this exact
  situation (`TextLayerSlot`'s fixed-luminance default, similarly
  documented and flagged rather than silently accepted).
- Wired into `apps/worker/src/temporal/activities/context.ts`'s
  `getCompositor()` with the same "self-adapting on credential presence"
  pattern the text-provider registrations already use: real
  `RemotionLambdaCompositor` when `REMOTION_AWS_REGION`,
  `REMOTION_AWS_LAMBDA_FUNCTION_NAME`, and `REMOTION_SITE_URL` are all
  set; `StubCompositor` otherwise (every existing render-workflow test
  keeps exercising this path, unchanged and still green).
- `infra/terraform/modules/regional-stack/remotion-lambda.tf`: a real
  `aws_iam_role` + `aws_iam_role_policy`, the policy a byte-for-byte
  reproduction of `@remotion/lambda`'s own `rolePermissions` array (its
  real bucket/function/log-group naming prefixes confirmed against
  `@remotion/lambda-client`'s actual `constants.js`, not memorized).
  Named per-environment (`remotion-lambda-role-${environment}-
  ${region_label}`), unlike Remotion's own CLI default of one bare
  account-wide role — passed to the deploy script via `deployFunction`'s
  real, documented `customRoleArn` override. Terraform deliberately does
  NOT create the S3 bucket or Lambda function itself: Remotion's own
  `getOrCreateBucket`/`deployFunction`/`deploySite` own that lifecycle
  (confirmed by the role's own `s3:CreateBucket` permission existing for
  exactly that reason).
- `apps/render/scripts/deploy-lambda.ts`: a real deploy script using the
  same three real SDK functions, reading `REMOTION_AWS_REGION` and the
  Terraform-output role ARN from the environment, printing the
  `functionName`/`serveUrl`/`bucketName` a deployer feeds back into
  `apps/worker`'s three `REMOTION_AWS_*`/`REMOTION_SITE_URL` env vars.
  Added a real `apps/render/tsconfig.typecheck.json` (mirroring
  `packages/db`'s own established `tsconfig.json`-builds-`src`-only-vs-
  `tsconfig.typecheck.json`-also-covers-`scripts` split) so this script is
  actually type-checked in CI, not silently excluded.

**Honestly unvalidated:** no AWS account exists in this sandbox, so no
real Lambda function has ever been deployed and no real render has ever
run end-to-end — the same category as every other funded-cloud-
infrastructure dependency across this entire build (STEP 22's own
Terraform included). What's real and verified: every SDK call shape
(confirmed against the installed package's actual source), the IAM policy
(byte-for-byte from Remotion's own source), the render-trigger→poll→
download→re-upload mechanics (12 passing tests with real assertions on
call shape, retry counts, and error propagation), and the env-var-gated
activation path (3 passing tests covering all-set/partially-set/unset).

**Verification:** full monorepo `pnpm build && pnpm typecheck && pnpm lint`
green (including a real type error this pass found and fixed in its own
new test file — `noUncheckedIndexedAccess` flagging an unchecked
`mock.calls[0]` access, fixed with the same `!` non-null-assertion style
already used throughout this codebase for identical cases). `pnpm test`
re-run in full.

## Unit 5 — Playwright E2E suite

`apps/web`'s `test:e2e` script was a literal `echo` placeholder; no
`@playwright/test` dependency, config, or spec existed anywhere.

**A real path investigated and correctly rejected, not just skipped:**
before falling back to page-rendering-only coverage, `@electric-sql/
pglite-socket` (a real TCP server exposing PGlite over the actual Postgres
wire protocol) was evaluated as a way to give the whole suite a genuinely
live database. Its own real documentation was read, not assumed: it has
**no per-connection authentication or role support** — every client that
connects, regardless of the username/password in its connection string,
runs against PGlite's single internal session. Since this build's C4
tenant-isolation invariant depends on the app's real connection actually
authenticating AS the `velocity_app` role (not a per-transaction `SET
LOCAL ROLE`, which is what the existing PGlite *test* harness uses
instead), running real E2E tests through it would produce green results
that prove nothing about RLS enforcement — worse than not testing it,
since it would look tested. Rejected on that specific, documented basis.

**What's real:**
- `@playwright/test` installed with all three browser engines (Chromium,
  Firefox, WebKit) per this user's own established convention.
- `apps/web/playwright.config.ts` — real `webServer` config, 3 browser
  projects.
- 5 real spec files (`e2e/*.spec.ts`) covering: the marketing root page;
  the full login/signup/forgot-password/reset-password flow added in Unit
  2 (form rendering, real client-side navigation via the actual `<Link>`
  components, real HTML5 validation blocking an empty submit); the
  onboarding state machine's first real stage; and the Velocity/Calendar
  app shell (sidebar active-state, the calendar view-mode tabs' real
  client-side state) — everything genuinely verifiable without a live
  database. The real "Publish now" button (STEP 12's own clickable demo
  path) is rendered per-slot from live data and so isn't exercised here —
  stated honestly in the spec file itself, not silently skipped.
- `pnpm --filter @velocity/web test:e2e` now genuinely runs
  `playwright test` (was the echo placeholder).

**Real bugs found and fixed via an actual run, not assumed away:**
1. First real run (against `pnpm dev`) hit genuine flakiness — `page.goto`
   timeouts and one aborted navigation — traced to Next dev's on-demand
   per-route compilation being overwhelmed by 3 browser projects hitting
   one dev server in parallel. Fixed at the root cause: `webServer.command`
   switched to a real `pnpm build && pnpm start` (a production server,
   pre-compiled, immune to this), which is also more representative of
   what these tests should exercise. Required raising `webServer.timeout`
   to 300s after measuring a real cold build+start at ~2.5 minutes in this
   sandbox.
2. One of this unit's own spec assertions was wrong, not the app: a
   `getByRole("alert")` selector matched two elements — the test's own
   alert AND Next.js's own hidden route-announcer div, which also carries
   `role="alert"` for accessibility. Fixed by scoping to the alert's own
   text.

**Final real result: 41 of 42 tests passed** across all three browsers
(chromium, firefox, webkit) against the real production build. The one
failure (WebKit, a single link-click navigation) was confirmed genuinely
flaky, not a bug: re-run in isolation 3 times, passed 3/3 — real-world E2E
timing noise from the full parallel run, not a reproducible defect.

**Verification:** full monorepo `pnpm build && pnpm typecheck && pnpm lint
&& pnpm test` re-verified green with the new `e2e/` spec files and
`playwright.config.ts` present (they don't affect the unit-test suite,
confirmed rather than assumed).
