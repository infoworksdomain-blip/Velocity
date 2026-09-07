-- Bug found during STEP 8: `refresh_credit_balances()` (migration 0001)
-- was never marked SECURITY DEFINER, so it runs with the CALLING role's
-- privileges rather than the function owner's. The app role (velocity_app)
-- can INSERT into credit_ledger (that's the entire point of the table) but
-- has no REFRESH privilege on the credit_balances materialized view —
-- so every real app-role insert into credit_ledger failed with
-- "permission denied for materialized view credit_balances" the moment
-- the AFTER INSERT trigger fired. This was never caught before STEP 8
-- because every prior test that inserted into credit_ledger did so
-- through the admin connection (which owns everything), never through
-- the app role in a live-tested path — STEP 8's C5 metering (STEP 8
-- packages/core/src/metering/usage-recorder.ts) is the first code in this
-- codebase that actually does that.
--
-- SECURITY DEFINER makes the function run with the privileges of whoever
-- DEFINED it (the migration/admin role, which owns the view), regardless
-- of who triggers it — the standard, correct Postgres pattern for letting
-- a restricted role trigger an owner-privileged side effect.
CREATE OR REPLACE FUNCTION refresh_credit_balances() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW credit_balances;
  RETURN NULL;
END;
$$;
