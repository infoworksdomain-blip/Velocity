Status: **PROCEEDING WITHOUT APPROVAL GATE** — the user has explicitly waived the "write plan, stop for approval" rule from `velocity-build-script.md` §0 for the remainder of this build. This file is kept for the same reason CLAUDE.md asked for it originally (a durable design record for whoever reads this repo later), not as a checkpoint awaiting sign-off.

# STEP 3 — Authentication / RBAC

## Scope decision (read before the rest of this file)

Signup/login/MFA/OAuth/sessions/RBAC is, on its own, a multi-week slice in a real team. Building every corner of it (email templates, full OAuth provider roster, admin impersonation UI, device-management UI) to production polish in one pass isn't a good use of this session. The split:

- **Built for real, unit-tested, no external dependency needed to verify:** the RBAC policy engine, password hashing, TOTP MFA, JWT session tokens, and a real Google OAuth2 adapter (Google's endpoints are stable and publicly documented, so this isn't "inventing a contract" — it's implementing one, fixture-tested against mocked HTTP).
- **Interface-only, explicitly flagged, not invented:** transactional email sending (needs a real provider — Resend/SES/etc. — and an account; STEP 3 ships a `EmailProvider` interface plus a local-dev adapter that logs instead of sending).
- **Schema added:** `sessions`, `mfa_credentials`, `mfa_recovery_codes`, `impersonation_sessions` — none of these existed in STEP 2's table list because the build script's own STEP 2 block doesn't include them, but STEP 3's "session revocation, device list, time-boxed impersonation" requirements need persistent storage. Migration `0002_auth`.
- **Wired into tRPC**, with a small but real router (`signup`, `login`, `logout`, `sessions.list`, `sessions.revoke`, `mfa.enroll`, `mfa.verify`) — enough to prove the permission-per-procedure pattern GATE 3 asks for, not a feature-complete auth UI (no pages/forms this step — STEP 5/7 own UI).
- **Same honest-verification posture as STEP 2:** anything needing a live Postgres gets an `itWithDb`-style test, written correctly, skipping loudly if unreachable. Anything DB-independent (RBAC matrix, password hashing, TOTP, JWT, OAuth adapter) gets a real vitest suite that runs and passes in this environment right now — STEP 3 has substantially more of this than STEP 2 did.

## RBAC design

Permission shape: `${resource}:${action}:${scope}`, scope always `workspace` or `platform` — matching `roles.scope` from the STEP 2 schema. One catalog (`packages/core/src/rbac/permissions.ts`), one role→permission map (`packages/core/src/rbac/roles.ts`), one `can(roleKey, permission)` function. tRPC procedures declare a required permission via a `requirePermission()` middleware wrapper — no `if (role === 'admin')` anywhere else, per the script's explicit rule.

Roles (from the script): workspace-scope `owner, admin, editor, contributor, viewer, client, agency_manager`; platform-scope `superadmin, support, moderator, finance`.

## Schema addition — migration `0002_auth`

```
sessions              # id, user_id, refresh_token_hash, user_agent, ip_address, created_at, last_used_at, revoked_at, expires_at
mfa_credentials       # id, user_id, secret_encrypted (via the STEP 2 KmsProvider), enabled_at, created_at
mfa_recovery_codes    # id, user_id, code_hash, used_at, created_at
impersonation_sessions # id, actor_user_id, target_user_id, reason, started_at, ended_at
```

All four are platform-root (no `workspace_id`) — sessions and MFA belong to a `user`, not a workspace; RLS from ADR 0003 doesn't apply to them, same as `users`/`organisations`. Impersonation events are additionally written to the existing `audit_logs` table (actor, target, action="impersonate", before/after null) — `impersonation_sessions` tracks the session's own lifecycle (start/end), `audit_logs` is the permanent record GATE 3 checks for.

## GATE 3 (from the script) — how each check is actually verified here

| Check | Verification |
|---|---|
| Permission matrix test covering every role × every permission | `packages/core/src/rbac/__tests__/matrix.test.ts` — runs for real, no DB needed. Asserts every permission has at least one granting role, every role has at least one permission, no workspace role holds a platform-scope permission or vice versa, and spot-checks specific expected grants/denials. |
| Impersonation writes an audit log | `apps/web` procedure writes to `audit_logs` and `impersonation_sessions` in one transaction; DB-dependent, `itWithDb`-gated, unverified live in this environment for the same reason as STEP 2. |
| MFA enrolment and recovery work end to end | `packages/core/src/auth/__tests__/totp.test.ts` — runs for real: enroll (generate secret + recovery codes), verify a valid TOTP code, verify a recovery code, confirm a used recovery code can't be reused. No DB or external service needed — TOTP is self-contained. |

## What this step does not do

No signup/login/MFA UI (STEP 5/7). No real email provider wired up (interface only). No OAuth providers beyond Google (TikTok/Meta/Google's *publishing* scopes are STEP 11's job — this is only "sign in with Google" for platform auth, a narrower and already-stable contract). No device-management UI. No API-key auth path (explicitly stubbed for STEP 16 per the script). No workspace-scoped permission middleware yet — that needs workspace-context resolution (`x-workspace-id`, a WorkspaceGuard-equivalent), which is explicitly STEP 4's job; STEP 3's `requirePlatformPermission` only covers `platform`-scope permissions.

## What was actually built

- **Schema:** `packages/db/src/schema/auth.ts` (`sessions`, `mfa_credentials`, `mfa_recovery_codes`, `impersonation_sessions`) plus three new columns on `users` (`password_hash`, `email_verified_at`, `platform_role_id` — the last one is the actual mechanism for assigning a platform role, since `memberships` requires a `workspace_id` and platform roles aren't workspace-scoped). Migrations `0002_auth` and `0003_users_credentials`, both with hand-written down files. Total table count is now 53 (49 from STEP 2 + 4 from `0002_auth`).
- **`packages/core/src/rbac/`** — `permissions.ts` (28-entry catalog), `roles.ts` (the 11-role → permission map), `policy.ts` (`can`, `assertPermission`).
- **`packages/core/src/auth/`** — `password.ts` (bcrypt), `totp.ts` (otpauth-based enroll/verify/recovery codes), `session-tokens.ts` (jose-based access/refresh JWTs), `email-provider.ts` (interface + local-dev console adapter), `oauth/google.ts` (real adapter against Google's documented OIDC endpoints).
- **`apps/web/server/`** — `context.ts` (session cookie → verified user, checking the `sessions` row itself for revocation, not just the JWT's own expiry), `trpc.ts` (`protectedProcedure`, `requirePlatformPermission`), `session-service.ts`, `routers/auth.ts` (`signup`, `login`, `logout`, `me`, `sessions.list`, `sessions.revoke`, `mfa.enroll`, `mfa.verify`, `admin.impersonate`), wired into `app/api/trpc/[trpc]/route.ts`.

## GATE 3 — results

| Check | Expected | Actual | Pass |
|---|---|---|---|
| Permission matrix test | Every role × permission resolves correctly; no cross-scope leaks | `packages/core/src/rbac/__tests__/matrix.test.ts` — 10 tests, all passing for real in this environment (no DB needed) | ✅ |
| MFA enrolment and recovery work end to end | Enroll, verify a live TOTP token, verify/reject recovery codes | `packages/core/src/auth/__tests__/totp.test.ts` — 6 tests, all passing for real | ✅ |
| Impersonation writes an audit log | A DB-backed check | `admin.impersonate` writes both `impersonation_sessions` and `audit_logs`; **not run** — no live Postgres in this environment, same constraint as GATE 2 | ⚠️ not run |
| Whole-repo build/typecheck/lint/test | Clean on a fresh clone | Verified: `git clone` to a scratch dir, `pnpm install --frozen-lockfile`, `pnpm build`/`typecheck`/`lint`/`test` — all green, including 29 real passing tests (RBAC matrix, TOTP, session tokens, password hashing, Google OAuth adapter) | ✅ |

One real bug caught during verification: `apps/web/server/db.ts` originally created the admin Drizzle connection as an eager module-level constant, which crashed `next build`'s page-data-collection step (`DATABASE_URL is not set`) since that step imports route modules without a live DB configured. Fixed to lazy initialization (`getAdminDb()`), which also happens to be the right pattern generally (don't open a DB connection pool at import time).

**GATE 3: substantially passed.** Unlike GATE 2 (100% DB-dependent), most of STEP 3's actual policy logic is DB-independent and is genuinely, mechanically verified right now — not just typecheck-clean. Only the impersonation audit-log write needs a live Postgres to close out, tracked the same way as GATE 2's open items.
