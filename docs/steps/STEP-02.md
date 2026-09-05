# STEP 2 — Database

Status: **DONE — build/typecheck/lint/test verified on a clean clone; live-database checks unverified in this environment.** See GATE 2 results at the bottom.

## Goal (from `velocity-build-script.md`)

Full schema, migrations, seed data, and RLS policies for all 44 tables named in the script, in `packages/db` (Drizzle + Postgres 16 + pgvector), implementing ADR 0003's RLS design for real — including the `SET LOCAL` transaction wrapper that ADR 0003 flags as the part of RLS-under-pooling everyone gets wrong.

## 1. Local dev infrastructure (new — `docker-compose.yml` at repo root)

Nothing in STEP 1 actually runs Postgres; GATE 2 ("migrations up and down cleanly") needs a live database to run against. Adding:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16   # ships the pgvector extension pre-built
    environment: [POSTGRES_USER=velocity, POSTGRES_PASSWORD=velocity, POSTGRES_DB=velocity]
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
```

This is the compose file `.vscode/tasks.json`'s "docker: up" task already refers to from STEP 1 — it just didn't exist yet because nothing needed it until now.

## 2. Table groups and design decisions

Grouped as the script itself groups them. Every table in every group below gets `workspace_id uuid not null` (except the two noted as platform-root) + the RLS policy from ADR 0003, `created_at`/`updated_at`, and `deleted_at` (soft delete) where the table holds user-authored content.

| Group | Tables | Notes |
|---|---|---|
| Tenancy root | `organisations`, `workspaces`, `users`, `memberships`, `roles`, `invitations` | `organisations` and `users` are platform-root (no `workspace_id` — a user can belong to multiple workspaces via `memberships`). **Design decision flagged below.** |
| Brand | `brand_profiles` (versioned), `brand_assets`, `brand_rules` | `brand_profiles.embedding` gets a pgvector HNSW index. Versioning via `(workspace_id, brand_id, version)` rather than mutating rows in place — STEP 6's diff/version-history UI depends on old versions surviving. |
| Content planning | `angles`, `trend_blueprints`, `personas`, `ugc_clips` (licensed, `release_ref`) | `trend_blueprints.embedding` gets an HNSW index. `ugc_clips.release_ref` is a required foreign key to a consent/licence record — nullable is not an option here per STEP 15's hard requirement. |
| Content production | `content_concepts`, `storyboards`, `text_plans`, `hook_variants`, `content_items` | `content_concepts.embedding` and `hook_variants.embedding` get HNSW indexes (duplicate-hook check, STEP 8B.4). `content_items.status` is the `CONCEPT → QUEUED → RENDERING → READY → SCHEDULED → PUBLISHED` / `REJECTED` / `FAILED` enum from STEP 9. |
| Rendering | `renders`, `media_assets`, `fonts`, `text_style_presets` | `renders` carries the C2PA/provenance columns (`ai_generated boolean not null`, `model_id`, `prompt_hash`) per **C2** — not nullable, not added later. |
| Blitz | `blitz_sessions`, `blitz_events` | `blitz_events` is append-only (swipe telemetry — direction, dwell time, replay count; STEP 9 says dwell time is the signal most implementations forget, so it's a required column, not optional). |
| Scheduling & publishing | `campaigns`, `calendar_slots`, `schedules`, `publications`, `publication_attempts` | `publications.idempotency_key` is unique-indexed — this is the mechanical enforcement behind "retries never double-post" (STEP 12). `publication_attempts` is the append-only attempt log; `publications` holds current state. |
| Social platform | `social_accounts`, `platform_credentials` (encrypted), `platform_quota_state` | `platform_credentials.encrypted_payload` is the only place a token exists; app-layer code must never select it except inside the token-refresh path. Encryption approach is a decision flagged below. |
| Analytics & attribution | `metric_snapshots`, `attribution_events`, `link_shorts` | High write volume — no RLS-breaking shortcuts here just because it's analytics; still `workspace_id`-scoped like everything else. |
| Billing | `credit_ledger`, `usage_events`, `subscriptions`, `invoices` | `credit_ledger`: append-only, double-entry (`debit`/`credit` columns, never an update), balance exposed as a materialised view refreshed on write, not stored as a mutable column. `usage_events`: this is the literal implementation of **C5** — provider, model, units, cost columns, all `not null`. |
| Automation | `automations`, `automation_runs`, `agent_runs` | `agent_runs` includes a `spend_cap_usd` and running `spend_usd` — STEP 16's hard spend-ceiling enforcement reads this row, not an in-memory counter. |
| Platform API | `api_keys`, `webhooks`, `webhook_deliveries` | `api_keys` stores a hash, never the raw key (same custody discipline as `platform_credentials`). |
| Governance | `audit_logs`, `feature_flags`, `moderation_reviews`, `risk_signals` | `audit_logs`: append-only, **no delete grant at the database role level** — this is enforced by revoking `DELETE` on the table from the application's Postgres role, not just by omitting a delete code path. |

**Total: 49 tables**, matching the script's list exactly. (This plan originally said 44 — a miscount caught when `drizzle-kit generate` reported the real total during implementation. Corrected here rather than silently left wrong.)

## 3. Design decisions this step has to make (flagging per rule 7 — these aren't in the script verbatim, they're necessary to make the script's table list buildable)

1. **`users`/`memberships`/`roles` are hand-designed, not an Auth.js/Clerk adapter schema.** STEP 3's RBAC model (`resource:action:scope`, e.g. `content:publish:workspace`, plus the specific role list `owner/admin/editor/contributor/viewer/client/agency_manager` + platform roles) doesn't match what Auth.js's or Clerk's default adapter schema models. STEP 2 builds `users`/`memberships`/`roles`/`invitations` to fit VELOCITY's own RBAC design; STEP 3 wires whichever auth provider is chosen to write into these tables (credential/session mechanics only), rather than adopting the provider's schema wholesale. Flagging this now because it constrains STEP 3's options — worth confirming before STEP 2's migration is written, since a schema change after STEP 3 depends on it is more expensive than one before.
2. **`platform_credentials` encryption**: the script says "envelope-encrypted via KMS." For local dev (no cloud KMS available), the plan is a `KmsProvider` interface (mirroring ADR 0004's pattern) with a local-dev adapter using a symmetric key from an env var (`ENCRYPTION_KEY`, AES-256-GCM) and a cloud adapter (AWS KMS / GCP KMS) stubbed for production, selected the same way STEP 8's video/image providers are selected — config, not code. This keeps local dev unblocked without weakening the production posture.
3. **`credit_ledger` balance**: implemented as a Postgres materialised view (`credit_balances`) refreshed via a trigger on insert to `credit_ledger`, rather than a denormalised `balance` column on `workspaces` — a column invites a write path that isn't the ledger, which is exactly what "append-only, double-entry" is meant to prevent.

## 4. RLS implementation (per ADR 0003)

- Every tenant table's policy: `CREATE POLICY workspace_isolation ON <table> USING (workspace_id = current_setting('app.workspace_id')::uuid);` plus `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY; ALTER TABLE <table> FORCE ROW LEVEL SECURITY;` (the `FORCE` variant matters — without it, the table owner role bypasses RLS entirely, which would make the isolation test pass for a non-owner app role while silently not protecting the connection the app actually uses if misconfigured).
- `packages/db/src/client.ts`: every request-scoped query runs inside a transaction that opens with `SET LOCAL app.workspace_id = $1` before any other statement, exactly as ADR 0003 specifies — never bare `SET`. A missing/unset value must make RLS-protected queries return zero rows (fail closed), verified as its own acceptance test.

## 5. Migrations, seed data

- Drizzle Kit generates SQL migrations from `packages/db/src/schema/*.ts` (one file per table group above, mirroring the table above) into `packages/db/migrations/`.
- `packages/db/seed/seed.ts`: one demo organisation, one demo workspace (`workspace_type: business`), a demo user with `owner` role, and enough rows in `brand_profiles`/`angles` to make STEP 5+'s onboarding demoable later. Idempotent (safe to re-run against a dev DB).

## 6. Files to be created

```
docker-compose.yml
packages/db/
  src/
    schema/
      tenancy.ts          # organisations, workspaces, users, memberships, roles, invitations
      brand.ts             # brand_profiles, brand_assets, brand_rules
      content-planning.ts  # angles, trend_blueprints, personas, ugc_clips
      content-production.ts # content_concepts, storyboards, text_plans, hook_variants, content_items
      rendering.ts         # renders, media_assets, fonts, text_style_presets
      blitz.ts             # blitz_sessions, blitz_events
      scheduling.ts        # campaigns, calendar_slots, schedules, publications, publication_attempts
      social.ts            # social_accounts, platform_credentials, platform_quota_state
      analytics.ts         # metric_snapshots, attribution_events, link_shorts
      billing.ts           # credit_ledger, usage_events, subscriptions, invoices
      automation.ts        # automations, automation_runs, agent_runs
      platform-api.ts      # api_keys, webhooks, webhook_deliveries
      governance.ts        # audit_logs, feature_flags, moderation_reviews, risk_signals
      index.ts             # barrel + RLS policy SQL emitted alongside table defs
    client.ts              # transaction wrapper: SET LOCAL app.workspace_id, per ADR 0003
    kms.ts                 # KmsProvider interface + local-dev adapter (design decision 2)
  migrations/               # generated by drizzle-kit, committed
  seed/seed.ts
  __tests__/
    tenant-isolation.generated.test.ts   # GATE 2's generated test
    migrations-up-down.test.ts            # GATE 2's up/down test
    rls-fail-closed.test.ts               # unset app.workspace_id -> zero rows
packages/db/drizzle.config.ts   # updated to point at src/schema/index.ts (was a placeholder in STEP 1)
.env.example                     # add ENCRYPTION_KEY
```

## 7. Acceptance tests (mapped to GATE 2)

| GATE 2 check | Acceptance test |
|---|---|
| Migrations up and down cleanly | `migrations-up-down.test.ts`: spin up a throwaway schema against the docker-compose Postgres, run every migration forward, assert all 49 tables + indexes exist, run every migration's `down` in reverse order, assert the schema is empty. |
| Generated tenant-isolation test (not hand-written) | `tenant-isolation.generated.test.ts`: at test-run time, introspect `information_schema.columns` for every table with a `workspace_id` column (not a hard-coded list), insert one row per table for Workspace A and Workspace B, `SET LOCAL app.workspace_id` to A, assert every table's query returns only A's row and zero of B's. Re-run for B. This test fails loudly if a new tenant table is added later without RLS — it discovers the table by introspection, not by a maintained list. |
| (New, from ADR 0003) RLS fails closed | `rls-fail-closed.test.ts`: run a query with `app.workspace_id` unset — assert zero rows returned, not an error and not all rows. |
| (New, from design decision 3) Ledger integrity | A test that writes a sequence of `credit_ledger` entries and asserts the `credit_balances` materialised view matches the sum, and that no code path can `UPDATE` or `DELETE` a `credit_ledger` row (grant-level check, not just application-level). |
| (New, governance) Audit log delete grant | A test connecting as the application's Postgres role and asserting `DELETE FROM audit_logs` fails at the grant level. |

## What this step does NOT do

No application code reads or writes through this schema yet (STEP 3 is the first consumer, for `users`/`memberships`/`roles`). No real KMS integration — the local-dev symmetric adapter only, with the cloud adapter's interface defined but unimplemented (flagged, not invented, per rule 5). No actual credit pricing/plan logic — STEP 19 owns that; STEP 2 only builds the ledger's storage shape.

## GATE 2 — results

| Check | Expected | Actual | Pass |
|---|---|---|---|
| Schema/migrator/tests build, typecheck, lint clean | Exits 0 from a fresh clone | Verified literally: fresh `git clone` to a scratch directory, `pnpm install --frozen-lockfile`, `pnpm build`/`typecheck`/`lint`/`test` — 9/9 tasks green, including `@velocity/db` | ✅ |
| Migrations up and down cleanly | Written and typecheck-clean | `migrations-up-down.test.ts` exists and correctly exercises the migrator, but **could not run against a live database in this environment** — no Docker is installed on this machine, and the only reachable Postgres is a pre-existing native Windows service (`postgresql-x64-16`) with no credentials available to this session | ⚠️ not run |
| Generated tenant-isolation test | Written and typecheck-clean | `tenant-isolation.generated.test.ts` + `helpers/fixture-builder.ts` exist (introspection-driven, no hand-maintained table list) but **could not run** for the same reason | ⚠️ not run |
| RLS fails closed | Written and typecheck-clean | `rls-fail-closed.test.ts` exists but **could not run** | ⚠️ not run |
| Ledger integrity (grant-level) | Written and typecheck-clean | `ledger-integrity.test.ts` exists but **could not run** | ⚠️ not run |
| Audit log delete grant | Written and typecheck-clean | `audit-log-delete-grant.test.ts` exists but **could not run** | ⚠️ not run |

**GATE 2: PARTIALLY VERIFIED, NOT PASSED.** Every check that this environment *can* verify (the code compiles, typechecks, lints clean, and the test suite runs and skips — rather than hangs or crashes — with no reachable database) is green. The five checks that are GATE 2's actual substance — proof against a real Postgres that RLS isolation, the migrator's up/down cycle, and the grant restrictions actually work — are **unverified**, not passing. All five tests are written to run for real (see `__tests__/`) and are designed to skip loudly (`ctx.skip()`, reported as "skipped" not "passed") rather than silently report green when `DATABASE_URL` is unreachable, per the build script's own rule against marking a gate passed when a check failed or couldn't be checked.

**To actually close this gate**, from a machine with a reachable Postgres 16+ with the `vector` extension available:
```bash
# .env: set DATABASE_URL (superuser/owner) and DATABASE_URL_APP (velocity_app role — created by the migration itself, see 0001_rls_and_policies.up.sql)
pnpm --filter @velocity/db migrate up
pnpm --filter @velocity/db test
```

## Next action

STEP 2 is code-complete and stopped here per the user's explicit choice to skip live-database verification for now (no Docker on this machine; declined to hunt down the existing native Postgres service's credentials). Next: write `/docs/steps/STEP-03.md` (Authentication / RBAC) and stop for approval before writing STEP 3 code. STEP 3's RBAC design should be checked against the `roles`/`memberships` schema shape from design decision 1 above before assuming it fits.
