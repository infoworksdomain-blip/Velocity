/**
 * STEP 2 owns the real schema: organisations, workspaces, RLS policies
 * (ADR 0003), pgvector HNSW indexes, the append-only credit_ledger and
 * audit_logs tables, and the generated tenant-isolation test.
 *
 * This file is a deliberate placeholder so `pnpm build` succeeds end to end
 * across the workspace before that schema exists.
 */

export const DB_PACKAGE_PLACEHOLDER = "STEP 2 owns the schema — see /docs/architecture/adr/0003-rls-vs-schema-per-tenant.md";
