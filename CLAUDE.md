# CLAUDE.md — VELOCITY

This file is read by Claude Code at the start of every session in this repo. The full contract is `./velocity-build-script.md` — read it before writing any code. This file is the fast-recall summary: constraints, naming, tokens, and the commands to run.

## What this is

VELOCITY: a multi-tenant SaaS that turns a website URL into short-form video and slideshow content, then schedules and publishes it to TikTok, Instagram Reels and YouTube Shorts, with performance data feeding back into what gets generated next.

Sibling project note: `../socialblitz-app` is a separate, earlier, simpler build of an adjacent idea (broader social platform coverage, lighter stack, demo-data adapters). It is **not** part of this repo, is not migrated from, and should not be referenced as a pattern source — VELOCITY has its own stack and constraints below.

## Current step

**The user has waived the "write plan, stop for approval" rule for the remainder of this build (see chat) — proceeding continuously through the steps, no per-step approval gate.** STEP-NN.md files are still written for the design record, just not as checkpoints.

**STEP 1 (Architecture) — GATE 1 passed.** **STEP 2 (Database) — code-complete, live-DB checks unverified** (no Docker, no credentials for the pre-existing native Postgres on this machine — see `docs/steps/STEP-02.md`). **STEP 3 (Auth/RBAC) — substantially passed**: RBAC policy engine, password hashing, TOTP MFA, JWT sessions, and a real Google OAuth adapter. **STEP 4 (Workspace) — substantially passed**: workspace CRUD, membership/invitations, ownership transfer, settings resolution, provisional seat limits, `requireWorkspacePermission`, and a React Query workspace switcher with GATE 4's cache-isolation property genuinely tested. **STEP 5 (Onboarding) — substantially passed**: the onboarding state machine, abandonment-event instrumentation, and a functional (unstyled) wizard. **STEP 6 (Brand Intelligence) — GATE 6 passed for real**: a real Playwright crawler with real DNS-pinned SSRF defenses (verified against a real local honeypot server and a real 20-site crawl of production websites, ~152s, ≥75% success required and achieved) and real injection-safe prompt construction; only the final LLM extraction call is a stub (needs a funded Anthropic/OpenAI API key — a credential decision, not invented here). 79 tests passing across the monorepo; DB-backed checks remain the one consistently open item since STEP 2.

Two environment/tooling notes worth knowing before touching adjacent code:
- `packages/core`'s package.json has an `exports` map (root + `./onboarding` subpath + `./*` wildcard) — a client component importing the root barrel once pulled server-only `node:crypto` code into the browser bundle and broke `next build`. Any future browser-safe module added to `packages/core` needs the same treatment.
- `apps/web/next.config.ts` externalizes `playwright`/`playwright-core`/`chromium-bidi` via both `serverExternalPackages` and a manual `webpack.externals` fallback (the documented mechanism alone didn't stop webpack from trying to bundle Playwright's native/optional deps in this Next version). Any other native-binding package added later (sharp, canvas, etc.) will likely need the same two-pronged treatment.

Next: STEP 7 (Design System + Dashboard).

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

1. **Blitz is a two-tier queue.** Cheap LLM-only concept cards (hook + angle + storyboard + a preview still with the hook composited on) are what users swipe through. The expensive video render fires only on swipe-right. Never render before the swipe. Swipe-to-next latency budget: 100ms.
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
