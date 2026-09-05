-- Reverses 0001_rls_and_policies.up.sql. Does not drop the velocity_app
-- role itself: role drops are cluster-wide, not schema-scoped, and other
-- migrations or ordinary operations may depend on the role continuing to
-- exist. Grants are left as-is for the same reason they're moot once
-- 0000's down migration drops every table with CASCADE immediately after
-- this one runs.

DROP TRIGGER IF EXISTS credit_ledger_refresh_balances ON credit_ledger;
DROP FUNCTION IF EXISTS refresh_credit_balances();
DROP MATERIALIZED VIEW IF EXISTS credit_balances;

DROP INDEX IF EXISTS hook_variants_embedding_hnsw_idx;
DROP INDEX IF EXISTS content_concepts_embedding_hnsw_idx;
DROP INDEX IF EXISTS trend_blueprints_embedding_hnsw_idx;
DROP INDEX IF EXISTS brand_profiles_embedding_hnsw_idx;

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
    EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %I', tenant_table);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tenant_table);
  END LOOP;
END
$$;
