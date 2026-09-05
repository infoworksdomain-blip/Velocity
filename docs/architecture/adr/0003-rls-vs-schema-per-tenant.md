# ADR 0003 — Postgres RLS over schema-per-tenant

## Status
Accepted

## Context
**C4** requires tenant isolation by default across every workspace-scoped table. Two standard approaches exist: give every tenant its own Postgres schema (or database), or keep one shared schema with row-level security policies scoping every query by `workspace_id`. Schema-per-tenant gives strong physical isolation but multiplies migration operations by tenant count, complicates cross-tenant admin/analytics queries (STEP 18), and doesn't fit a self-serve signup flow where workspaces are created continuously and cheaply.

## Decision
**Row-Level Security (RLS)** on every tenant table, with the policy shape:

```sql
CREATE POLICY workspace_isolation ON <table>
  USING (workspace_id = current_setting('app.workspace_id')::uuid);
```

Every tenant table gets this policy **at creation time** in STEP 2 — not retrofitted later — and the generated test from GATE 2 (enumerate every table with a `workspace_id` column, prove tenant A gets zero rows of tenant B's data) runs in CI on every migration.

## The pooling hazard this creates (documented so it isn't rediscovered the hard way)
`current_setting('app.workspace_id')` is a **session-scoped** setting. Under a connection pooler (PgBouncer in transaction mode, or any connection reuse across requests), the session variable from request A can leak into the connection Postgres later hands to request B if it isn't reset. The mitigation:

- Set `app.workspace_id` with `SET LOCAL` inside an explicit transaction wrapping every request's queries — `SET LOCAL` is transaction-scoped and is automatically cleared at `COMMIT`/`ROLLBACK`, so it cannot leak into a pooled connection's next transaction.
- Never use bare `SET` (session-scoped) for this value.
- The Drizzle query layer in `packages/db` wraps every request in a transaction that opens with `SET LOCAL app.workspace_id = ...` before any other query runs, so no call site can forget it.
- A missing or unset `app.workspace_id` must make every RLS-protected query return zero rows (fail closed), never fall through to "no filter."

## Consequences
- Slightly more per-request overhead (transaction wrapper + `SET LOCAL`) than an unscoped connection, acceptable for the isolation guarantee it buys.
- Cross-tenant admin/analytics queries (STEP 18) need an explicit, audited privilege path (e.g. a superadmin role with a separate, logged policy) rather than simply omitting the workspace filter.
- This is the single ADR most directly load-bearing for **C4**, and it is why STEP 2's GATE explicitly requires a *generated* isolation test rather than a hand-maintained one — schema drift between "tables that exist" and "tables the isolation test knows about" is the realistic failure mode.
