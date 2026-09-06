# STEP 4 — Workspace

Status: proceeding without an approval gate (see STEP-03.md's header note).

## Scope

The script's STEP 4 bundles five things: membership/invitations (mostly built in STEP 3's schema, procedures land here), a workspace switcher, per-workspace settings resolution, seat limits by plan, and ownership transfer/archival. Plus GATE 4's specific demand: prove workspace-switching never leaks cached data across the tenant boundary — a React Query cache-key problem, not just a backend one.

Boundary with STEP 3: STEP 3 built `requirePlatformPermission` and explicitly deferred workspace-scoped permission checking here, since that needs a resolved "which workspace, what's my role in it" — this step builds that (`requireWorkspacePermission`, reading `x-workspace-id`).

Boundary with STEP 19 (Billing): seat limits need a plan→limit mapping. STEP 19 owns the authoritative plan/pricing model; this step ships a minimal `PLAN_SEAT_LIMITS` placeholder just sufficient to enforce a cap on invitations, explicitly flagged as provisional.

## What was built

- **Migration `0004_settings`**: `settings jsonb not null default '{}'` on both `workspaces` and `organisations`.
- **`packages/core/src/settings/`**: `PLATFORM_DEFAULT_SETTINGS` + `resolveSetting(key, { workspaceSettings, organisationSettings })` — pure function implementing the exact resolution order the script specifies (workspace override → org default → platform default). Fully unit-tested, no DB needed.
- **`packages/core/src/plans/`**: `PLAN_SEAT_LIMITS` (placeholder numbers, flagged for STEP 19 to own for real) + `canAddSeat(planKey, currentMemberCount)`. Unit-tested.
- **`apps/web/server/trpc.ts`**: added `requireWorkspacePermission(permission)` — reads `x-workspace-id` from the request, resolves the caller's membership + role in that workspace via a DB lookup, then delegates to the same `rbac.can()` STEP 3 built. This is the workspace-scope half of the permission middleware STEP 3 deferred.
- **`apps/web/server/routers/workspace.ts`**: `create`, `get`, `update`, `archive`, `transferOwnership`, `members.list`, `members.invite` (seat-limit enforced), `members.acceptInvitation`, `members.remove`, `settings.get`.
- **Frontend**: `apps/web/app/providers.tsx` (React Query provider), `apps/web/lib/workspace-context.tsx` (current-workspace-id state + a `useWorkspaceScopedQueryKey` helper that prefixes every query key with the active workspace id — this is the actual mechanism GATE 4's cache-isolation property depends on), `apps/web/components/workspace-switcher.tsx`.

## GATE 4 — how it's verified

| Check | Verification |
|---|---|
| A user in three workspaces sees strictly separate data | `apps/web/server/routers/__tests__/workspace-permission.test.ts` (DB-independent — tests `requireWorkspacePermission`'s role-resolution logic against a mocked DB layer) plus the DB-dependent membership/invite procedures themselves, `itWithDb`-gated like STEP 2/3's open items. |
| Switching context never leaks cached data (React Query) | `apps/web/lib/__tests__/workspace-context.test.tsx` — mounts a `QueryClientProvider`, seeds the cache under workspace A's key, switches the active workspace to B, asserts a query for the "same" logical resource under B's key is a cache miss (not served A's stale data), and that A's cached entry is still intact (switching doesn't destroy other workspaces' cache, it just doesn't cross-serve it). This runs for real, no backend needed — it's testing the query-key discipline, which is exactly where GATE 4 says real implementations usually get this wrong. |

## What this step does not do

No onboarding wizard (STEP 5). No visual design for the switcher beyond functional markup — Appendix A's actual component styling is STEP 7's job, and this step's UI exists to make the cache-isolation property testable, not to be the shipped UI. No real plan/pricing logic (STEP 19). No SSO (mentioned in the script's business-tier description but not detailed until later).

## GATE 4 — results

| Check | Expected | Actual | Pass |
|---|---|---|---|
| Switching context never leaks cached data (React Query) | Cache entries are workspace-keyed; switching never serves a stale cross-workspace value | `apps/web/lib/__tests__/workspace-context.test.tsx` — 2 tests, genuinely passing: proves the query key changes per workspace, and that switching workspace never renders the previous workspace's data (even before the new workspace's own query settles) while also not evicting the previous workspace's cache entry | ✅ |
| A user in three workspaces sees strictly separate data | Membership/role resolution is workspace-scoped; cross-workspace access is rejected | `requireWorkspacePermission` (apps/web/server/trpc.ts) resolves role via a `memberships` row scoped to `(workspaceId, userId)` — structurally cannot resolve a role for a workspace the caller isn't a member of. The end-to-end DB-backed version of this (three real workspaces, three real memberships) needs a live Postgres; **not run**, same open item as GATE 2/3. | ⚠️ partially verified |
| Whole-repo build/typecheck/lint/test clean | On a fresh clone | Verified: apps/web and packages/core both typecheck/lint/build clean and their new tests pass for real, on a clean clone (see below) | ✅ |

**GATE 4: substantially passed.** The one property GATE 4 calls out by name — the React Query cache-isolation mechanism — is fully, mechanically verified in this environment. The DB-backed "three real workspaces" end-to-end check is the remaining open item, consistent with every other DB-dependent check in this build so far.

