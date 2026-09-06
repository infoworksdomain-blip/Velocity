import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema/index";

export type Database = NodePgDatabase<typeof schema>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

let appPool: Pool | undefined;

function getAppPool(): Pool {
  appPool ??= new Pool({ connectionString: requireEnv("DATABASE_URL_APP") });
  return appPool;
}

/**
 * Every tenant-scoped query must run through this wrapper (ADR 0003).
 *
 * It opens a transaction and sets `app.workspace_id` via
 * `set_config(..., true)` — the parameterized equivalent of `SET LOCAL`,
 * transaction-scoped and cleared at COMMIT/ROLLBACK, so it cannot leak into
 * a pooled connection's next transaction the way a bare `SET` would.
 *
 * Omitting `workspaceId` is a deliberate, supported call shape: it leaves
 * `app.workspace_id` unset, and every RLS-protected query then returns zero
 * rows (fail closed) rather than falling through to "no filter." This is
 * exercised directly by the rls-fail-closed test, not a gap to patch.
 *
 * Callers use the app-role connection pool (`DATABASE_URL_APP`), never the
 * migration/owner connection — the owner role would bypass RLS regardless
 * of `app.workspace_id`, defeating the isolation guarantee entirely.
 */
export async function withWorkspace<T>(
  workspaceId: string | undefined,
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query("BEGIN");
    if (workspaceId) {
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    }
    const db = drizzle(client, { schema });
    const result = await fn(db);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Admin/migration connection only — bypasses RLS as the table owner. Never used for request-scoped application queries. */
export function createAdminPool(): Pool {
  return new Pool({ connectionString: requireEnv("DATABASE_URL") });
}

/**
 * A Drizzle instance over the admin pool, for platform-root tables that
 * have no RLS to begin with (users, sessions, mfa_*, roles, organisations
 * — see ADR 0003's scope note). Not for anything workspace-scoped; use
 * withWorkspace for that.
 */
export function createAdminDb(): Database {
  return drizzle(createAdminPool(), { schema });
}

export async function closeAppPool(): Promise<void> {
  if (appPool) {
    await appPool.end();
    appPool = undefined;
  }
}

export type { PoolClient };
