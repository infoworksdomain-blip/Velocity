import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

/**
 * A minimal hand-rolled up/down migration runner.
 *
 * Why not drizzle-kit's own migrator: drizzle-kit does not generate or run
 * down migrations (there is no such feature) — GATE 2 explicitly requires
 * "migrations up and down cleanly," so this project pairs every
 * `<name>.up.sql` with a hand-written `<name>.down.sql` and applies them
 * itself. drizzle-kit is still used, but only as a DDL-diff generator for
 * `<name>.up.sql` files derived from the schema (see 0000_initial_schema);
 * anything not expressible in the schema DSL (RLS, FORCE, materialized
 * views/triggers — 0001_rls_and_policies) is hand-written from the start.
 *
 * The tracking table lives in its own `migrations_meta` schema, not
 * `public`, specifically so a down migration that does something as blunt
 * as `DROP SCHEMA public CASCADE` cannot take the tracking table down with
 * it mid-transaction.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

export interface MigrationFile {
  name: string;
  upPath: string;
  downPath: string;
}

export function loadMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR);
  const names = new Set(
    files.filter((f) => f.endsWith(".up.sql")).map((f) => f.replace(/\.up\.sql$/, "")),
  );
  return Array.from(names)
    .sort()
    .map((name) => ({
      name,
      upPath: join(MIGRATIONS_DIR, `${name}.up.sql`),
      downPath: join(MIGRATIONS_DIR, `${name}.down.sql`),
    }));
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query("CREATE SCHEMA IF NOT EXISTS migrations_meta");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations_meta.applied_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedNames(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    "SELECT name FROM migrations_meta.applied_migrations",
  );
  return new Set(result.rows.map((r) => r.name));
}

export async function migrateUp(pool: Pool): Promise<string[]> {
  await ensureMigrationsTable(pool);
  const applied = await appliedNames(pool);
  const ran: string[] = [];

  for (const migration of loadMigrations()) {
    if (applied.has(migration.name)) continue;
    const sql = readFileSync(migration.upPath, "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO migrations_meta.applied_migrations (name) VALUES ($1)",
        [migration.name],
      );
      await client.query("COMMIT");
      ran.push(migration.name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, {
        cause: error,
      });
    } finally {
      client.release();
    }
  }
  return ran;
}

/** Reverts the most recently applied migrations, most recent first. `steps = Infinity` reverts everything. */
export async function migrateDown(pool: Pool, steps = Infinity): Promise<string[]> {
  await ensureMigrationsTable(pool);
  const applied = await appliedNames(pool);
  const migrations = loadMigrations()
    .filter((m) => applied.has(m.name))
    .sort((a, b) => (a.name < b.name ? 1 : -1));

  const reverted: string[] = [];
  for (const migration of migrations) {
    if (reverted.length >= steps) break;
    const sql = readFileSync(migration.downPath, "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("DELETE FROM migrations_meta.applied_migrations WHERE name = $1", [
        migration.name,
      ]);
      await client.query("COMMIT");
      reverted.push(migration.name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(
        `Reverting migration ${migration.name} failed: ${(error as Error).message}`,
        { cause: error },
      );
    } finally {
      client.release();
    }
  }
  return reverted;
}
