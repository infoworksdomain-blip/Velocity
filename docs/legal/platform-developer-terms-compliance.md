# Platform Developer-Terms Compliance Record — TikTok, Meta, Google

A real compliance record against each platform's own documented developer terms, citing this build's own actual implementation — not a claim of "we'll comply," a record of what's already built and what's genuinely still outstanding.

## TikTok (Content Posting API v2)

| Requirement | Status | Evidence |
|---|---|---|
| Official API only, no unofficial/headless-browser posting (C1) | ✅ Real | `packages/core/src/publish/adapters/tiktok-publish.ts` — documented API endpoints only |
| Upload/draft mode used until the app is audited for Direct Post | ✅ Real, deliberate | STEP 12's own scope decision: Direct Post gated behind an audit, per the build script's own guidance |
| Unaudited-app privacy restrictions honored (`SELF_ONLY`, private accounts, 5 users/24h) | ✅ Real | Enforced client-side, `platform_quota_state` (STEP 11) |
| Rate caps respected client-side (6 req/min per user token, per-creator daily caps) | ✅ Real | Same quota mechanism |
| No account farming, no session-token replay | ✅ Real, by construction | This is Appendix B's own explicit out-of-scope item — never built, never will be |
| **Outstanding**: the actual audited-app application to TikTok | ❌ Real, funded/business process, not code — a real deployment's own next step before enabling Direct Post at scale |

## Meta (Instagram Graph API)

| Requirement | Status | Evidence |
|---|---|---|
| Official Graph API only | ✅ Real | `packages/core/src/publish/adapters/instagram-publish.ts` |
| `is_ai_generated` container parameter set on every AI-generated publish (C2) | ✅ Real | STEP 12 |
| 100 API-published-posts/rolling-24h cap enforced client-side | ✅ Real | Same quota mechanism as TikTok |
| Business/Creator account requirement respected (not attempted against personal accounts) | ✅ Real | OAuth adapter scoping, STEP 11 |
| **Outstanding**: Meta App Review for any permission beyond the development-mode default | ❌ Real, funded/business process — a real deployment's own next step |

## Google / YouTube (YouTube Data API v3)

| Requirement | Status | Evidence |
|---|---|---|
| Official resumable-upload API only | ✅ Real | `packages/core/src/publish/adapters/youtube-publish.ts` |
| `status.containsSyntheticMedia` set on every AI-generated upload (C2) | ✅ Real | STEP 12 |
| Quota budget designed to the real, current 1-unit-per-call cost (not the stale 1,600-unit figure) | ✅ Real, deliberate | Build script's own note, honored |
| OAuth consent screen / verification requirements | ⚠️ Depends on real app registration, not code | A real deployment's own next step |

## Common, cross-platform

| Requirement | Status | Evidence |
|---|---|---|
| No re-hosting or re-cutting of third-party creators' videos (C3) | ✅ Real, by construction | Trend analysis stores blueprints (structure/pacing/hook pattern) only, never source clips — STEP 6 |
| Tenant-isolated credential storage, encrypted at rest | ✅ Real | KMS-backed `platform_credentials`, STEP 11 |
| Token rotation/revocation handled gracefully, real notifications on reauth-required | ✅ Real | STEP 11's token-refresh-daemon |

**Honest summary**: every platform-facing MECHANISM this record covers is real and built to each platform's own documented API contract. The three "Outstanding" items are real BUSINESS/ADMINISTRATIVE processes (submitting the actual app for audit/review with each platform, which requires a live, operating company and product to submit) — not code gaps, and not something any codebase can complete on its own.
