-- RLS, the app role, pgvector indexes, and the credit ledger's balance
-- view (ADR 0003, STEP 2 design decisions 1-3). Hand-written — none of this
-- is expressible in Drizzle's schema DSL for this version (no FORCE ROW
-- LEVEL SECURITY, no materialized views/triggers), so it lives here rather
-- than split between generated and hand-written migrations.

-- === App role ===
-- Idempotent and portable: works whether a docker-compose init script (or
-- Terraform, in a real environment) already created this role, or not.
-- Only a role WITHOUT superuser matters here — RLS's FORCE clause has no
-- effect on a superuser or the table owner, so this role must never be
-- granted either.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'velocity_app') THEN
    CREATE ROLE velocity_app LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO velocity_app;

-- === RLS: enable + force + policy on every tenant table ===
-- Discovered by introspection (every table with a workspace_id column),
-- not a hand-maintained list — this mirrors GATE 2's own "generated test,
-- not hand-written list" requirement, applied to the setup itself.
--
-- IMPORTANT for future steps: this loop runs once, now. A later migration
-- that adds a NEW table with a workspace_id column must include its own
-- ENABLE/FORCE/POLICY statements — this migration will not retroactively
-- cover it.
DO $$
DECLARE
  tenant_table text;
BEGIN
  FOR tenant_table IN
    SELECT DISTINCT c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'workspace_id'
      AND NOT a.attisdropped
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY workspace_isolation ON %I USING (workspace_id = current_setting(''app.workspace_id'', true)::uuid)',
      tenant_table
    );
  END LOOP;
END
$$;

-- === pgvector HNSW indexes ===
CREATE INDEX brand_profiles_embedding_hnsw_idx ON brand_profiles USING hnsw (embedding vector_cosine_ops);
CREATE INDEX trend_blueprints_embedding_hnsw_idx ON trend_blueprints USING hnsw (embedding vector_cosine_ops);
CREATE INDEX content_concepts_embedding_hnsw_idx ON content_concepts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX hook_variants_embedding_hnsw_idx ON hook_variants USING hnsw (embedding vector_cosine_ops);

-- === credit_ledger balance (STEP 2 design decision 3) ===
-- A materialised view, refreshed from the ledger, never a mutable column
-- on workspaces — there is no write path that can express "set the
-- balance," only "record a ledger movement."
CREATE MATERIALIZED VIEW credit_balances AS
SELECT workspace_id, COALESCE(SUM(credit) - SUM(debit), 0) AS balance
FROM credit_ledger
GROUP BY workspace_id;

CREATE UNIQUE INDEX credit_balances_workspace_id_idx ON credit_balances (workspace_id);

-- Plain (non-CONCURRENTLY) refresh: this runs inside the same transaction
-- as the triggering INSERT via AFTER ... FOR EACH STATEMENT, and
-- REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction
-- block. At STEP 2/dev/test scale a brief exclusive lock on the view during
-- refresh is the right trade-off; revisit under STEP 19/21 write volume.
CREATE OR REPLACE FUNCTION refresh_credit_balances() RETURNS trigger AS $$
BEGIN
  REFRESH MATERIALIZED VIEW credit_balances;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_ledger_refresh_balances
AFTER INSERT ON credit_ledger
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_credit_balances();

GRANT SELECT ON credit_balances TO velocity_app;

-- === Baseline grants ===
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO velocity_app', tbl);
  END LOOP;
END
$$;

-- === Specific restrictions (append-only tables) ===
-- audit_logs: no delete grant at the database level (not just an omitted
-- code path) — a row is never removed after insert.
REVOKE DELETE ON audit_logs FROM velocity_app;

-- credit_ledger: append-only, double-entry — no code path can express
-- "change a past movement," enforced at the grant level, not just by
-- application convention.
REVOKE UPDATE, DELETE ON credit_ledger FROM velocity_app;
