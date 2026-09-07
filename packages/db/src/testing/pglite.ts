import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "../schema/index.js";

/**
 * A genuinely real, embedded Postgres for tests — not a mock, not a
 * simulation of Postgres semantics. PGlite is a real Postgres compiled to
 * WASM; this harness replays this package's own real migration files
 * against it (the same .up.sql files that run against production
 * Postgres), including migration 0001's dynamic RLS-enabling loop and
 * every later migration's hand-added RLS/grant blocks. Discovered and
 * verified during STEP 8: it genuinely enforces row-level security
 * (`SET LOCAL ROLE` + `FORCE ROW LEVEL SECURITY` + a real policy actually
 * blocks cross-workspace reads), supports the `vector` extension, and
 * supports real transactions/savepoints — everything this codebase's RLS
 * and idempotency guarantees depend on.
 *
 * This closes a gap that's stood since STEP 2: every `itWithDb`-skipped
 * test in packages/db (and STEP 8's own render-step idempotency tests)
 * could be rewritten against this harness instead of skipped for lack of
 * a reachable network Postgres. STEP 8 uses it for its own new tests;
 * retrofitting STEP 2-7's existing skipped tests is a real, valuable
 * follow-up flagged in docs/steps/STEP-08.md and CLAUDE.md, not done here
 * to keep this step's scope to STEP 8's own work.
 *
 * One deliberate adaptation: PGlite does not bundle the `pgcrypto`
 * extension, so migration 0000's `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
 * statement is stripped before replay. Nothing in this schema uses
 * anything from pgcrypto beyond `gen_random_uuid()`, which has been a
 * Postgres core builtin (no extension required) since PG13 — verified by
 * grepping every migration for `crypt(`/`digest(`/`hmac(`/`pgp_sym`/
 * `gen_salt` and finding none. The real migration file is untouched; only
 * this test harness's in-memory replay skips the one statement PGlite
 * can't satisfy but doesn't need.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

function stripUnsupportedStatements(migrationSql: string): string {
  return migrationSql.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;(--> statement-breakpoint)?\n?/g, "");
}

async function replayMigrations(pglite: PGlite): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();
  for (const file of files) {
    const raw = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await pglite.exec(stripUnsupportedStatements(raw));
  }
}

export type PgliteSchemaDb = PgliteDatabase<typeof schema>;

export interface PgliteTestDb {
  /** Runs `fn` inside a real transaction, as the `velocity_app` role, with `app.workspace_id` set — the same RLS context every real request runs under. */
  runInWorkspaceTx<T>(workspaceId: string | undefined, fn: (db: PgliteSchemaDb) => Promise<T>): Promise<T>;
  /** The unscoped drizzle instance (superuser/table-owner — bypasses RLS, mirrors createAdminDb() in client.ts). Use for fixture setup, never for tenant-scoped assertions. */
  admin: PgliteSchemaDb;
  close(): Promise<void>;
}

export async function createPgliteTestDb(): Promise<PgliteTestDb> {
  const pglite = await PGlite.create({ extensions: { vector } });
  await replayMigrations(pglite);

  const admin = drizzle(pglite, { schema });

  async function runInWorkspaceTx<T>(workspaceId: string | undefined, fn: (db: PgliteSchemaDb) => Promise<T>): Promise<T> {
    return admin.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE velocity_app`));
      if (workspaceId) {
        await tx.execute(sql`SELECT set_config('app.workspace_id', ${workspaceId}, true)`);
      }
      // else: leave app.workspace_id unset, matching production client.ts's
      // withWorkspace(). NOTE — a confirmed real difference from production
      // Postgres, found while building this harness: real Postgres's
      // current_setting('app.workspace_id', true) returns SQL NULL for a
      // truly-unset custom GUC, and NULL::uuid is NULL (no error) — so the
      // RLS policy's `workspace_id = current_setting(...)::uuid` correctly
      // evaluates to unknown/false, i.e. fails closed. PGlite's WASM engine
      // instead returns '' for the same missing_ok call, and ''::uuid is a
      // hard cast ERROR, not NULL. This is a PGlite engine limitation, not a
      // production bug — verified by attempting explicit `set_config(...,
      // NULL, true)` and `RESET app.workspace_id`, both of which hit the
      // identical error, meaning PGlite itself never represents "this custom
      // GUC has no value" as NULL. Consequence: this harness cannot exercise
      // the *literally-unset* fail-closed path — only real Postgres
      // (rls-fail-closed.test.ts, itWithDb-gated) can. What this harness CAN
      // and does verify is the equally real "workspace id set to a value
      // matching no row" fail-closed path (see pglite-harness.test.ts).
      return fn(tx);
    });
  }

  return {
    runInWorkspaceTx,
    admin,
    close: () => pglite.close(),
  };
}
