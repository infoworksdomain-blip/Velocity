import { Pool } from "pg";

/**
 * Short-timeout reachability probe. Every test in this suite is written to
 * run for real against a live Postgres, but this environment has neither
 * Docker nor credentials for the native Postgres service already running
 * on this machine (see docs/steps/STEP-02.md GATE 2 results) — so tests
 * skip loudly via `ctx.skip()` rather than silently reporting green.
 */
export async function isDatabaseReachable(connectionString: string | undefined): Promise<boolean> {
  if (!connectionString) return false;
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}
