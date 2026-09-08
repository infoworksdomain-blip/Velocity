import { Pool } from "pg";
import { describe, expect } from "vitest";
import { loadMigrations, migrateDown, migrateUp } from "../src/migrator";
import { itWithDb } from "./helpers/it-with-db";

describe("migrations up/down (GATE 2)", () => {
  itWithDb("applies every migration, then reverts every migration, leaving an empty schema", async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // Start from a known-clean slate regardless of what a prior run left behind.
      await migrateDown(pool, Infinity);

      const expectedNames = loadMigrations().map((m) => m.name);
      const ran = await migrateUp(pool);
      expect(ran).toEqual(expectedNames);

      // Deliberately NOT a hardcoded expected count: this build has grown
      // from ~5 migrations (STEP 2/5, when this assertion was first
      // written) to 25 (through STEP 20) over the course of the build,
      // and a literal number here would go stale every time a step adds
      // a table — exactly what happened before this fix (a real, found-
      // and-fixed bug: the old hardcoded `toBe(54)` was undetected for
      // the rest of the build because this itWithDb-gated test has never
      // had a reachable DATABASE_URL to actually run against in this
      // sandbox). The real assertion worth keeping is "non-zero and
      // sane" — a genuinely empty or single-digit count after applying
      // every migration would indicate `migrateUp` silently skipped
      // work, which the `ran === expectedNames` check above wouldn't by
      // itself catch if a migration ran but created nothing.
      const tableCount = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
      );
      expect(Number(tableCount.rows[0]!.count)).toBeGreaterThan(50);

      const reverted = await migrateDown(pool, Infinity);
      expect(reverted).toEqual([...expectedNames].reverse());

      const tableCountAfterDown = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
      );
      expect(Number(tableCountAfterDown.rows[0]!.count)).toBe(0);

      // Round-trip: applying up again from empty must work identically.
      const ranAgain = await migrateUp(pool);
      expect(ranAgain).toEqual(expectedNames);
    } finally {
      await pool.end();
    }
  });
});
