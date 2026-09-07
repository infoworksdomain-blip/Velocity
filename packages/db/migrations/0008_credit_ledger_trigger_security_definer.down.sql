-- Reverts to migration 0001's original (buggy) definition — SECURITY
-- INVOKER is Postgres's default, restated explicitly here so this down
-- migration doesn't rely on an implicit default being unchanged in a
-- future Postgres version.
CREATE OR REPLACE FUNCTION refresh_credit_balances() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW credit_balances;
  RETURN NULL;
END;
$$;
